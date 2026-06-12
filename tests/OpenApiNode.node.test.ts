import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenApiNode } from '../nodes/OpenAPINode/OpenApiNode.node';
import { loadOpenApiSpec, executeOpenApiRequest } from '../nodes/OpenAPINode/OpenApiHelper';
import { NodeOperationError } from 'n8n-workflow';
import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

// At the top of your test file
vi.mock('n8n-workflow', () => {
	return {
		NodeOperationError: class NodeOperationError extends Error {
			constructor(message: string, description?: string) {
				super(message);
				this.name = 'NodeOperationError';
			}
		},
	};
});
// Mock the OpenApiDescription
vi.mock('../nodes/OpenAPINode/OpenApiDescription', () => ({
	openApiOperations: [],
	openApiFields: [],
}));

// Mock the network-bound helpers used by the node, keep the pure helpers real
vi.mock('../nodes/OpenAPINode/OpenApiHelper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nodes/OpenAPINode/OpenApiHelper')>();
  return {
    ...actual,
    loadOpenApiSpec: vi.fn(),
    executeOpenApiRequest: vi.fn(),
  };
});

describe('OpenApiNode', () => {
  let node: OpenApiNode;
  let loadOptionsMethods: ILoadOptionsFunctions;

  beforeEach(() => {
    node = new OpenApiNode();
    // Create a basic loadOptionsFunctions context
    loadOptionsMethods = {
      getNodeParameter: vi.fn().mockReturnValue('https://example.com/spec'),
      getNode: vi.fn().mockReturnValue({ name: 'OpenAPI' }),
    } as unknown as ILoadOptionsFunctions;

    (loadOpenApiSpec as any).mockReset();
    (executeOpenApiRequest as any).mockReset();
  });

  describe('loadOptions.loadOperations', () => {
    it('should return operations when valid spec is provided', async () => {
      // Arrange
      const fakeSpec = {
        paths: {
          '/users': {
            get: {
              summary: 'Get Users',
              operationId: 'getUsers',
            },
          },
          '/posts': {
            post: {
              summary: 'Create Post',
              operationId: 'createPost',
            },
          },
        },
      };
      (loadOpenApiSpec as any).mockResolvedValue(fakeSpec);
      // Act
      const operations = await node.methods.loadOptions!.loadOperations.call(loadOptionsMethods);
      // Assert
      expect(operations).toHaveLength(2);
      expect(operations[0].name).toContain('GET /users');
      expect(operations[1].name).toContain('POST /posts');
    });

    it('should throw NodeOperationError when spec loading fails', async () => {
      (loadOpenApiSpec as any).mockRejectedValue(new Error('Spec load error'));
      // Act & Assert
      await expect(
        node.methods.loadOptions!.loadOperations.call(loadOptionsMethods)
      ).rejects.toThrow(NodeOperationError);
    });
  });

  describe('resourceMapping.getOperationParameters', () => {
    const specWithParams = {
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              { name: 'userId', in: 'path', required: true, schema: { type: 'integer' } },
              { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
            ],
          },
          put: {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: { name: { type: 'string' }, age: { type: 'integer' } },
                  },
                },
              },
            },
          },
        },
      },
    };

    it('should build resource mapper fields from spec parameters', async () => {
      (loadOpenApiSpec as any).mockResolvedValue(specWithParams);
      loadOptionsMethods.getNodeParameter = vi.fn((param: string) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'operation') return 'get:/users/{userId}';
        return undefined;
      }) as any;

      const result = await node.methods.resourceMapping!.getOperationParameters.call(loadOptionsMethods);

      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toMatchObject({
        id: 'path:userId',
        displayName: 'userId (path)',
        required: true,
        type: 'number',
      });
      expect(result.fields[1]).toMatchObject({
        id: 'query:verbose',
        required: false,
        type: 'boolean',
      });
    });

    it('should expose request body properties as body fields', async () => {
      (loadOpenApiSpec as any).mockResolvedValue(specWithParams);
      loadOptionsMethods.getNodeParameter = vi.fn((param: string) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'operation') return 'put:/users/{userId}';
        return undefined;
      }) as any;

      const result = await node.methods.resourceMapping!.getOperationParameters.call(loadOptionsMethods);

      expect(result.fields).toEqual([
        expect.objectContaining({ id: 'body:name', required: true, type: 'string' }),
        expect.objectContaining({ id: 'body:age', required: false, type: 'number' }),
      ]);
    });

    it('should return no fields when no operation is selected', async () => {
      loadOptionsMethods.getNodeParameter = vi.fn((param: string) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'operation') return '';
        return undefined;
      }) as any;

      const result = await node.methods.resourceMapping!.getOperationParameters.call(loadOptionsMethods);
      expect(result.fields).toEqual([]);
      expect(loadOpenApiSpec).not.toHaveBeenCalled();
    });

    it('should throw NodeOperationError when spec loading fails', async () => {
      (loadOpenApiSpec as any).mockRejectedValue(new Error('Spec load error'));
      loadOptionsMethods.getNodeParameter = vi.fn((param: string) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'operation') return 'get:/users/{userId}';
        return undefined;
      }) as any;

      await expect(
        node.methods.resourceMapping!.getOperationParameters.call(loadOptionsMethods)
      ).rejects.toThrow(NodeOperationError);
    });
  });

  describe('execute', () => {
    let executeFunctions: IExecuteFunctions;
    const fakeSpec = {
      paths: {
        '/test': {
          get: {
            summary: 'Test endpoint',
            operationId: 'testEndpoint',
          },
        },
      },
    };

    beforeEach(() => {
      executeFunctions = {
        getInputData: vi.fn().mockReturnValue([{}]),
        getNodeParameter: vi.fn((param: string, index: number, defaultValue?: unknown) => {
          if (param === 'openApiUrl') return 'https://example.com/spec';
          if (param === 'baseApiUrl') return 'https://api.example.com';
          if (param === 'operation') return { method: 'get', path: '/test' }; // modified: return an object with separated data
          if (param === 'parameters') return { id: 123 };
          if (param === 'requestBody') return { data: 'test' };
          return defaultValue;
        }),
        getCredentials: vi.fn().mockResolvedValue({ auth: 'dummy' }),
        continueOnFail: vi.fn().mockReturnValue(false),
        getNode: vi.fn().mockReturnValue({ name: 'OpenApiNode' }),
        helpers: {
          prepareBinaryData: vi.fn().mockResolvedValue({
            data: 'base64-data',
            mimeType: 'application/pdf',
          }),
        },
      } as unknown as IExecuteFunctions;

      (loadOpenApiSpec as any).mockResolvedValue(fakeSpec);
      (executeOpenApiRequest as any).mockResolvedValue({ success: true });
    });

    it('should execute and return correct response', async () => {
      // Act
      const result = await node.execute.call(executeFunctions);
      // Assert
      expect(loadOpenApiSpec).toHaveBeenCalledWith('https://example.com/spec');
      expect(executeOpenApiRequest).toHaveBeenCalledWith(
        fakeSpec,
        'get',
        '/test',
        { id: 123 },
        { data: 'test' },
        { auth: 'dummy' },
        'https://api.example.com',
        { responseFormat: 'json', timeout: undefined }
      );
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ success: true });
      expect(result[0][0].pairedItem.item).toBe(0);
    });

    it('should pass response format and timeout options to the request', async () => {
      executeFunctions.getNodeParameter = vi.fn((param: string, index: number, defaultValue?: unknown) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'baseApiUrl') return 'https://api.example.com';
        if (param === 'operation') return { method: 'get', path: '/test' };
        if (param === 'parameters') return {};
        if (param === 'requestBody') return {};
        if (param === 'options') return { responseFormat: 'string', timeout: 5000 };
        return defaultValue;
      }) as any;
      (executeOpenApiRequest as any).mockResolvedValue('raw text response');
      // Act
      const result = await node.execute.call(executeFunctions);
      // Assert
      expect(executeOpenApiRequest).toHaveBeenCalledWith(
        fakeSpec,
        'get',
        '/test',
        {},
        {},
        { auth: 'dummy' },
        'https://api.example.com',
        { responseFormat: 'string', timeout: 5000 }
      );
      expect(result[0][0].json).toEqual({ data: 'raw text response' });
    });

    it('should return binary data when response format is binary', async () => {
      executeFunctions.getNodeParameter = vi.fn((param: string, index: number, defaultValue?: unknown) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'baseApiUrl') return 'https://api.example.com';
        if (param === 'operation') return { method: 'get', path: '/test' };
        if (param === 'parameters') return {};
        if (param === 'requestBody') return {};
        if (param === 'options') return { responseFormat: 'binary' };
        return defaultValue;
      }) as any;
      const buffer = Buffer.from('binary-content');
      (executeOpenApiRequest as any).mockResolvedValue({ buffer, contentType: 'application/pdf' });
      // Act
      const result = await node.execute.call(executeFunctions);
      // Assert
      expect((executeFunctions as any).helpers.prepareBinaryData).toHaveBeenCalledWith(
        buffer,
        undefined,
        'application/pdf'
      );
      expect(result[0][0].binary).toEqual({
        data: { data: 'base64-data', mimeType: 'application/pdf' },
      });
      expect(result[0][0].json).toEqual({});
    });

    it('should merge resource mapper values into parameters and request body', async () => {
      executeFunctions.getNodeParameter = vi.fn((param: string, index: number, defaultValue?: unknown) => {
        if (param === 'openApiUrl') return 'https://example.com/spec';
        if (param === 'baseApiUrl') return 'https://api.example.com';
        if (param === 'operation') return 'post:/users/{userId}';
        if (param === 'parameters') return { parameter: [{ name: 'X-Manual', value: 'manual', type: 'header' }] };
        if (param === 'operationParameters.value') {
          return {
            'path:userId': 42,
            'query:verbose': true,
            'body:name': 'Test User',
          };
        }
        if (param === 'requestBody') return '{"existing": "value"}';
        return defaultValue;
      }) as any;

      await node.execute.call(executeFunctions);

      expect(executeOpenApiRequest).toHaveBeenCalledWith(
        fakeSpec,
        'post',
        '/users/{userId}',
        {
          parameter: [
            { name: 'userId', value: '42', type: 'path' },
            { name: 'verbose', value: 'true', type: 'query' },
            { name: 'X-Manual', value: 'manual', type: 'header' },
          ],
        },
        { existing: 'value', name: 'Test User' },
        { auth: 'dummy' },
        'https://api.example.com',
        { responseFormat: 'json', timeout: undefined }
      );
    });

    it('should add error to return items and continue when continueOnFail is true', async () => {
      // Arrange: cause executeOpenApiRequest to throw error
      (executeOpenApiRequest as any).mockRejectedValue(new Error('Request failed'));
      executeFunctions.continueOnFail = vi.fn().mockReturnValue(true);
      // Act
      const result = await node.execute.call(executeFunctions);
      // Assert
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json.error).toBe('Request failed');
    });

    it('should throw error when continueOnFail is false', async () => {
      // Arrange: cause executeOpenApiRequest to throw error
      (executeOpenApiRequest as any).mockRejectedValue(new Error('Fatal error'));
      executeFunctions.continueOnFail = vi.fn().mockReturnValue(false);
      // Act & Assert
      await expect(node.execute.call(executeFunctions)).rejects.toThrow('Fatal error');
    });
  });
});
