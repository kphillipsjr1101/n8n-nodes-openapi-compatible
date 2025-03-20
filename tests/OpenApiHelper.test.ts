import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadOpenApiSpec, executeOpenApiRequest } from '../nodes/OpenAPINode/OpenApiHelper';
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
