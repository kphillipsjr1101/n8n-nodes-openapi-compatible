import {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	INodeExecutionData,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ICredentialDataDecryptedObject,
	INodeInputConfiguration,
	INodeOutputConfiguration
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { openApiOperations, openApiFields } from './OpenApiDescription';
import { loadOpenApiSpec, executeOpenApiRequest } from './OpenApiHelper';

export class OpenApiNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenAPI',
		name: 'openApiNode',
		icon: 'file:openapi.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Consume any OpenAPI/Swagger based API',
		defaults: {
			name: 'OpenAPI',
		},
		credentials: [
			{
				name: 'openApi',
				required: false,
			},
		],
		inputs: ["main"] as unknown as INodeInputConfiguration[],
		outputs: ["main"] as unknown as INodeOutputConfiguration[],
		properties: [
			{
				displayName: 'OpenAPI Specification URL',
				name: 'openApiUrl',
				type: 'string',
				default: '',
				required: true,
				description: 'URL of the OpenAPI/Swagger specification',
			},
			{
				displayName: 'Base API URL',
				name: 'baseApiUrl',
				type: 'string',
				default: '',
				description: 'Override the server URL from the OpenAPI specification. Use this when the spec does not provide a server URL or you need to use a different endpoint.',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'API Endpoint',
						value: 'apiEndpoint',
					},
				],
				default: 'apiEndpoint',
			},
			...openApiOperations,
			...openApiFields,
		],
	};

	methods = {
		loadOptions: {
			// Method to load operations from the OpenAPI spec
			async loadOperations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const openApiUrl = this.getNodeParameter('openApiUrl', 0) as string;

				try {
					const spec = await loadOpenApiSpec(openApiUrl);
					const operations: INodePropertyOptions[] = [];

					// Parse paths and methods from the OpenAPI spec
					for (const path in spec.paths) {
						for (const method in spec.paths[path]) {
							const operation = spec.paths[path][method];
							operations.push({
								name: `${method.toUpperCase()} ${path} - ${operation.summary || operation.operationId || ''}`,
								value: `${method}:${path}`,
							});
						}
					}

					return operations;
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load OpenAPI spec: ${error.message}`);
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		const openApiUrl = this.getNodeParameter('openApiUrl', 0) as string;
		const baseApiUrl = this.getNodeParameter('baseApiUrl', 0, '') as string;

		// Make credentials retrieval optional
		let credentials: ICredentialDataDecryptedObject = {};
		try {
			credentials = await this.getCredentials('openApi') as ICredentialDataDecryptedObject;
		} catch (error) {
			// If credentials are not provided, continue without them
			if (!(error.message && error.message.includes('does not require credentials'))) {
				throw error;
			}
		}

		// Load the OpenAPI specification
		const spec = await loadOpenApiSpec(openApiUrl);

		for (let i = 0; i < items.length; i++) {
			try {
				// Get operation details
				const operation = this.getNodeParameter('operation', i) as string | { method: string; path: string }; // updated type to support both string and object formats

				// Updated extraction of method and path from the operation parameter:
				let method: string, path: string;
				if (typeof operation === 'string') {
					[method, path] = operation.split(':');
				} else if (typeof operation === 'object' && operation !== null) {
					({ method, path } = operation);
				} else {
					throw new NodeOperationError(this.getNode(), 'Invalid operation parameter format');
				}

				// Get parameters and request body
				const parameters = this.getNodeParameter('parameters', i, {}) as IDataObject;

				// Make request body truly optional
				let requestBody: IDataObject = {};
				const rawRequestBody = this.getNodeParameter('requestBody', i, '{}');

				// Parse request body if it's a string (from JSON input field)
				if (typeof rawRequestBody === 'string') {
					try {
						// Only parse non-empty strings
						if (rawRequestBody.trim() !== '') {
							requestBody = JSON.parse(rawRequestBody);
						}
					} catch (e) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid JSON in request body: ${(e as Error).message}`
						);
					}
				} else {
					requestBody = rawRequestBody as IDataObject;
				}

				// Execute the request
				const response = await executeOpenApiRequest(
					spec,
					method,
					path,
					parameters,
					requestBody,
					credentials,
					baseApiUrl,
				);

				returnItems.push({
					json: response,
					pairedItem: {
						item: i,
					},
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnItems.push({
						json: {
							error: error.message,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnItems];
	}
}
