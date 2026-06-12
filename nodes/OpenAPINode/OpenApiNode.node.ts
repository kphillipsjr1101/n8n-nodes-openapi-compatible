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
	INodeOutputConfiguration,
	ResourceMapperFields,
	ResourceMapperField
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { openApiOperations, openApiFields } from './OpenApiDescription';
import {
	loadOpenApiSpec,
	executeOpenApiRequest,
	getOperationDetails,
	mapSchemaToFieldType,
	splitMappedParameters,
	resolveRef,
	IBinaryResponse
} from './OpenApiHelper';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

// The operation parameter is stored as 'method:path' but may also arrive as an object via expressions
function parseOperationValue(operation: unknown): { method: string; path: string } | null {
	if (typeof operation === 'string' && operation.includes(':')) {
		const separatorIndex = operation.indexOf(':');
		return { method: operation.slice(0, separatorIndex), path: operation.slice(separatorIndex + 1) };
	}
	if (typeof operation === 'object' && operation !== null && 'method' in operation && 'path' in operation) {
		return operation as { method: string; path: string };
	}
	return null;
}

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
							// Skip non-operation keys like path-level 'parameters' or 'servers'
							if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
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
		resourceMapping: {
			// Build the parameter fields for the selected operation from the OpenAPI spec
			async getOperationParameters(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				const openApiUrl = this.getNodeParameter('openApiUrl', 0) as string;
				const operation = parseOperationValue(this.getNodeParameter('operation', 0));

				if (!openApiUrl || !operation) {
					return { fields: [] };
				}

				let spec: any;
				try {
					spec = await loadOpenApiSpec(openApiUrl);
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Failed to load OpenAPI spec: ${error.message}`);
				}

				const { parameters, requestBodySchema, requestBodyRequired } = getOperationDetails(
					spec,
					operation.method,
					operation.path,
				);

				const fields: ResourceMapperField[] = parameters.map((param) => {
					const { type, options } = mapSchemaToFieldType(param.schema);
					return {
						id: `${param.in}:${param.name}`,
						displayName: `${param.name} (${param.in})`,
						required: param.required,
						defaultMatch: false,
						canBeUsedToMatch: false,
						display: true,
						type,
						options,
					};
				});

				// Expose top-level request body properties as individual fields
				if (requestBodySchema?.properties && typeof requestBodySchema.properties === 'object') {
					const requiredProps = new Set(
						Array.isArray(requestBodySchema.required) ? requestBodySchema.required : [],
					);
					for (const [propName, rawPropSchema] of Object.entries(requestBodySchema.properties)) {
						const propSchema = resolveRef(spec, rawPropSchema);
						const { type, options } = mapSchemaToFieldType(propSchema);
						fields.push({
							id: `body:${propName}`,
							displayName: `${propName} (body)`,
							required: requestBodyRequired && requiredProps.has(propName),
							defaultMatch: false,
							canBeUsedToMatch: false,
							display: true,
							type,
							options,
						});
					}
				}

				return { fields };
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
				const parsedOperation = parseOperationValue(this.getNodeParameter('operation', i));
				if (!parsedOperation) {
					throw new NodeOperationError(this.getNode(), 'Invalid operation parameter format');
				}
				const { method, path } = parsedOperation;

				// Get parameters and request body
				let parameters = this.getNodeParameter('parameters', i, {}) as IDataObject;

				// Spec-defined parameters configured through the resource mapper UI
				const mappedValues = this.getNodeParameter('operationParameters.value', i, null) as IDataObject | null;
				const { parameters: specParameters, bodyFields } = splitMappedParameters(mappedValues ?? {});

				if (specParameters.length > 0) {
					const manualParameters = Array.isArray(parameters.parameter)
						? (parameters.parameter as IDataObject[])
						: [];
					// Manual parameters come last so header values can override spec-mapped ones
					parameters = { ...parameters, parameter: [...specParameters, ...manualParameters] };
				}

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

				// Spec-mapped body fields take precedence over the raw JSON body
				if (Object.keys(bodyFields).length > 0) {
					requestBody = { ...requestBody, ...bodyFields };
				}

				// Get request options (response format, timeout)
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const responseFormat = (options.responseFormat as 'json' | 'string' | 'binary') || 'json';
				const timeout = options.timeout as number | undefined;

				// Execute the request
				const response = await executeOpenApiRequest(
					spec,
					method,
					path,
					parameters,
					requestBody,
					credentials,
					baseApiUrl,
					{ responseFormat, timeout },
				);

				if (responseFormat === 'binary') {
					const { buffer, contentType } = response as IBinaryResponse;
					const binaryData = await this.helpers.prepareBinaryData(buffer, undefined, contentType);
					returnItems.push({
						json: {},
						binary: {
							data: binaryData,
						},
						pairedItem: {
							item: i,
						},
					});
				} else if (responseFormat === 'string') {
					returnItems.push({
						json: {
							data: response as string,
						},
						pairedItem: {
							item: i,
						},
					});
				} else {
					returnItems.push({
						json: response,
						pairedItem: {
							item: i,
						},
					});
				}
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
