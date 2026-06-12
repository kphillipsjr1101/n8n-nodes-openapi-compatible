import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	loadOpenApiSpec,
	executeOpenApiRequest,
	resolveRef,
	getOperationDetails,
	mapSchemaToFieldType,
	splitMappedParameters,
} from '../nodes/OpenAPINode/OpenApiHelper';
import { IDataObject } from 'n8n-workflow';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('OpenApiHelper', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('loadOpenApiSpec', () => {
		it('should load and parse JSON OpenAPI spec', async () => {
			const mockSpec = { openapi: '3.0.0', info: { title: 'Test API', version: '1.0.0' } };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				headers: { get: () => 'application/json' },
				text: async () => JSON.stringify(mockSpec),
				status: 200,
				statusText: 'OK'
			});

			const result = await loadOpenApiSpec('https://example.com/api-spec.json');
			expect(result).toEqual(mockSpec);
			expect(fetchMock).toHaveBeenCalledWith('https://example.com/api-spec.json', expect.anything());
		});

		it('should load and parse YAML OpenAPI spec', async () => {
			const mockSpec = { openapi: '3.0.0', info: { title: 'Test API', version: '1.0.0' } };
			const yamlContent = 'openapi: 3.0.0\ninfo:\n  title: Test API\n  version: 1.0.0';

			fetchMock.mockResolvedValueOnce({
				ok: true,
				headers: { get: () => 'application/yaml' },
				text: async () => yamlContent,
				status: 200,
				statusText: 'OK'
			});

			const result = await loadOpenApiSpec('https://example.com/api-spec.yaml');
			expect(result).toEqual(mockSpec);
		});

		it('should throw error for empty URL', async () => {
			await expect(loadOpenApiSpec('  ')).rejects.toThrow('OpenAPI URL is empty');
		});

		it('should throw error for invalid URL format', async () => {
			await expect(loadOpenApiSpec('invalid-url')).rejects.toThrow('Invalid URL format');
		});

		it('should throw error when fetch fails', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found'
			});

			await expect(loadOpenApiSpec('https://example.com/not-found')).rejects.toThrow('HTTP error! Status: 404');
		});

		it('should throw error for invalid JSON/YAML content', async () => {
			fetchMock.mockResolvedValueOnce({
				ok: true,
				headers: { get: () => 'application/json' },
				text: async () => 'invalid json',
				status: 200,
				statusText: 'OK'
			});

			await expect(loadOpenApiSpec('https://example.com/invalid')).rejects.toThrow('Failed to parse response');
		});
	});

	describe('resolveRef', () => {
		const spec = {
			components: {
				parameters: {
					Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
				},
				schemas: {
					User: { type: 'object', properties: { name: { type: 'string' } } },
					// Reference chain: Alias -> User
					Alias: { $ref: '#/components/schemas/User' },
					// Circular reference
					Loop: { $ref: '#/components/schemas/Loop' },
				},
			},
		};

		it('should resolve internal references', () => {
			const resolved = resolveRef(spec, { $ref: '#/components/parameters/Limit' });
			expect(resolved).toEqual({ name: 'limit', in: 'query', schema: { type: 'integer' } });
		});

		it('should resolve chained references', () => {
			const resolved = resolveRef(spec, { $ref: '#/components/schemas/Alias' });
			expect(resolved).toEqual(spec.components.schemas.User);
		});

		it('should return non-reference objects unchanged', () => {
			const obj = { type: 'string' };
			expect(resolveRef(spec, obj)).toBe(obj);
		});

		it('should not loop forever on circular references', () => {
			const resolved = resolveRef(spec, { $ref: '#/components/schemas/Loop' });
			expect(resolved).toEqual({ $ref: '#/components/schemas/Loop' });
		});

		it('should return unresolvable references unchanged', () => {
			const ref = { $ref: '#/components/schemas/Missing' };
			expect(resolveRef(spec, ref)).toBe(ref);
		});
	});

	describe('getOperationDetails', () => {
		it('should extract operation parameters from an OpenAPI 3 spec', () => {
			const spec = {
				paths: {
					'/users/{userId}': {
						parameters: [
							{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } },
						],
						get: {
							parameters: [
								{ name: 'verbose', in: 'query', schema: { type: 'boolean' } },
								{ $ref: '#/components/parameters/Limit' },
							],
						},
					},
				},
				components: {
					parameters: {
						Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } },
					},
				},
			};

			const details = getOperationDetails(spec, 'GET', '/users/{userId}');

			expect(details.parameters).toEqual([
				{ name: 'userId', in: 'path', required: true, description: undefined, schema: { type: 'integer' } },
				{ name: 'verbose', in: 'query', required: false, description: undefined, schema: { type: 'boolean' } },
				{ name: 'limit', in: 'query', required: false, description: undefined, schema: { type: 'integer' } },
			]);
			expect(details.requestBodySchema).toBeUndefined();
		});

		it('should let operation-level parameters override path-level ones', () => {
			const spec = {
				paths: {
					'/items': {
						parameters: [{ name: 'limit', in: 'query', schema: { type: 'string' } }],
						get: {
							parameters: [{ name: 'limit', in: 'query', required: true, schema: { type: 'integer' } }],
						},
					},
				},
			};

			const details = getOperationDetails(spec, 'get', '/items');
			expect(details.parameters).toHaveLength(1);
			expect(details.parameters[0].required).toBe(true);
			expect(details.parameters[0].schema).toEqual({ type: 'integer' });
		});

		it('should extract the JSON request body schema from an OpenAPI 3 spec', () => {
			const spec = {
				paths: {
					'/users': {
						post: {
							requestBody: {
								required: true,
								content: {
									'application/json': {
										schema: { $ref: '#/components/schemas/User' },
									},
								},
							},
						},
					},
				},
				components: {
					schemas: {
						User: {
							type: 'object',
							required: ['name'],
							properties: { name: { type: 'string' }, age: { type: 'integer' } },
						},
					},
				},
			};

			const details = getOperationDetails(spec, 'post', '/users');
			expect(details.requestBodyRequired).toBe(true);
			expect(details.requestBodySchema).toEqual(spec.components.schemas.User);
		});

		it('should extract body and parameter types from a Swagger 2.0 spec', () => {
			const spec = {
				swagger: '2.0',
				paths: {
					'/pets': {
						post: {
							parameters: [
								{ name: 'status', in: 'query', type: 'string', enum: ['available', 'sold'] },
								{
									name: 'body',
									in: 'body',
									required: true,
									schema: { type: 'object', properties: { name: { type: 'string' } } },
								},
							],
						},
					},
				},
			};

			const details = getOperationDetails(spec, 'POST', '/pets');
			expect(details.parameters).toHaveLength(1);
			expect(details.parameters[0].name).toBe('status');
			expect(details.parameters[0].schema.enum).toEqual(['available', 'sold']);
			expect(details.requestBodyRequired).toBe(true);
			expect(details.requestBodySchema).toEqual({ type: 'object', properties: { name: { type: 'string' } } });
		});

		it('should return empty details for unknown operations', () => {
			expect(getOperationDetails({ paths: {} }, 'get', '/missing')).toEqual({
				parameters: [],
				requestBodyRequired: false,
			});
		});
	});

	describe('mapSchemaToFieldType', () => {
		it('should map basic schema types', () => {
			expect(mapSchemaToFieldType({ type: 'integer' }).type).toBe('number');
			expect(mapSchemaToFieldType({ type: 'number' }).type).toBe('number');
			expect(mapSchemaToFieldType({ type: 'boolean' }).type).toBe('boolean');
			expect(mapSchemaToFieldType({ type: 'array' }).type).toBe('array');
			expect(mapSchemaToFieldType({ type: 'object' }).type).toBe('object');
			expect(mapSchemaToFieldType({ type: 'string' }).type).toBe('string');
			expect(mapSchemaToFieldType({ type: 'string', format: 'date-time' }).type).toBe('dateTime');
			expect(mapSchemaToFieldType(undefined).type).toBe('string');
		});

		it('should map enums to options', () => {
			const result = mapSchemaToFieldType({ type: 'string', enum: ['asc', 'desc'] });
			expect(result.type).toBe('options');
			expect(result.options).toEqual([
				{ name: 'asc', value: 'asc' },
				{ name: 'desc', value: 'desc' },
			]);
		});
	});

	describe('splitMappedParameters', () => {
		it('should split mapped values into parameters and body fields', () => {
			const result = splitMappedParameters({
				'path:userId': 123,
				'query:verbose': true,
				'header:X-Trace': 'abc',
				'cookie:session': 'xyz',
				'body:name': 'Test User',
				'body:tags': ['a', 'b'],
			});

			expect(result.parameters).toEqual([
				{ name: 'userId', value: '123', type: 'path' },
				{ name: 'verbose', value: 'true', type: 'query' },
				{ name: 'X-Trace', value: 'abc', type: 'header' },
				{ name: 'session', value: 'xyz', type: 'cookie' },
			]);
			expect(result.bodyFields).toEqual({ name: 'Test User', tags: ['a', 'b'] });
		});

		it('should skip empty values and unknown keys', () => {
			const result = splitMappedParameters({
				'query:empty': '',
				'query:missing': null,
				noSeparator: 'value',
				'unknown:location': 'value',
			} as IDataObject);

			expect(result.parameters).toEqual([]);
			expect(result.bodyFields).toEqual({});
		});
	});

	describe('executeOpenApiRequest', () => {
		it('should execute request with base URL from parameters', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const mockResponse = { data: 'test' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
				text: async () => JSON.stringify(mockResponse)
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{ parameter: [] } as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(result).toEqual(mockResponse);
			expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/users', expect.anything());
		});

		it('should replace path parameters correctly', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const mockResponse = { data: 'test' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
				text: async () => JSON.stringify(mockResponse)
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users/{userId}',
				{
					parameter: [
						{ type: 'path', name: 'userId', value: '123' }
					]
				} as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/users/123', expect.anything());
		});

		it('should handle query parameters correctly', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const mockResponse = { data: 'test' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
				text: async () => JSON.stringify(mockResponse)
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{
					parameter: [
						{ type: 'query', name: 'page', value: '1' },
						{ type: 'query', name: 'limit', value: '10' }
					]
				} as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/users?page=1&limit=10', expect.anything());
		});

		it('should handle header parameters correctly', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const mockResponse = { data: 'test' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
				text: async () => JSON.stringify(mockResponse)
			});

			await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{
					parameter: [
						{ type: 'header', name: 'X-Custom-Header', value: 'custom-value' }
					]
				} as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					headers: expect.objectContaining({
						'X-Custom-Header': 'custom-value'
					})
				})
			);
		});

		it('should handle API key authentication in header', async () => {
			const mockSpec = {
				openapi: '3.0.0',
				components: {
					securitySchemes: {
						apiKey: {
							type: 'apiKey',
							in: 'header',
							name: 'X-API-Key'
						}
					}
				}
			};

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: 'test' })
			});

			await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{ parameter: [] } as IDataObject,
				{},
				{
					'X-API-Key': 'secret-key'
				},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					headers: expect.objectContaining({
						'X-API-Key': 'secret-key'
					})
				})
			);
		});

		it('should throw an error when no server URL is provided', async () => {
			const mockSpec = { openapi: '3.0.0' };

			await expect(executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{ parameter: [] } as IDataObject,
				{},
				{}
			)).rejects.toThrow('No server URL found');
		});

		it('should return raw text when response format is string', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const textResponse = 'plain text response, not JSON';

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => { throw new Error('should not be called'); },
				text: async () => textResponse
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/report',
				{ parameter: [] } as IDataObject,
				{},
				{},
				'https://api.example.com',
				{ responseFormat: 'string' }
			);

			expect(result).toBe(textResponse);
		});

		it('should return a buffer and content type when response format is binary', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const binaryContent = new TextEncoder().encode('binary-content').buffer;

			fetchMock.mockResolvedValueOnce({
				ok: true,
				headers: { get: () => 'application/pdf' },
				json: async () => { throw new Error('should not be called'); },
				arrayBuffer: async () => binaryContent
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/download',
				{ parameter: [] } as IDataObject,
				{},
				{},
				'https://api.example.com',
				{ responseFormat: 'binary' }
			);

			expect(Buffer.isBuffer(result.buffer)).toBe(true);
			expect(result.buffer.toString()).toBe('binary-content');
			expect(result.contentType).toBe('application/pdf');
		});

		it('should default to JSON parsing when no response format is given', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const mockResponse = { data: 'test' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse
			});

			const result = await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{ parameter: [] } as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(result).toEqual(mockResponse);
		});

		it('should send cookie parameters via the Cookie header', async () => {
			const mockSpec = { openapi: '3.0.0' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: 'test' })
			});

			await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{
					parameter: [
						{ type: 'cookie', name: 'session', value: 'abc123' },
						{ type: 'cookie', name: 'theme', value: 'dark' }
					]
				} as IDataObject,
				{},
				{},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					headers: expect.objectContaining({
						'Cookie': 'session=abc123; theme=dark'
					})
				})
			);
		});

		it('should pass an abort signal when a timeout is configured', async () => {
			const mockSpec = { openapi: '3.0.0' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ data: 'test' })
			});

			await executeOpenApiRequest(
				mockSpec,
				'GET',
				'/users',
				{ parameter: [] } as IDataObject,
				{},
				{},
				'https://api.example.com',
				{ timeout: 5000 }
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					signal: expect.any(AbortSignal)
				})
			);
		});

		it('should handle request bodies correctly', async () => {
			const mockSpec = { openapi: '3.0.0' };
			const requestBody = { name: 'Test User', email: 'test@example.com' };

			fetchMock.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ id: 1, ...requestBody })
			});

			await executeOpenApiRequest(
				mockSpec,
				'POST',
				'/users',
				{ parameter: [] } as IDataObject,
				requestBody,
				{},
				'https://api.example.com'
			);

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(requestBody)
				})
			);
		});
	});
});
