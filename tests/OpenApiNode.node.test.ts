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

// Mock the helpers used by the node
vi.mock('../nodes/OpenAPINode/OpenApiHelper', () => ({
  loadOpenApiSpec: vi.fn(),
  executeOpenApiRequest: vi.fn(),
}));

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
        'https://api.example.com'
      );
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({ success: true });
      expect(result[0][0].pairedItem.item).toBe(0);
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
