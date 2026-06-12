import { IDataObject, FieldType, INodePropertyOptions } from 'n8n-workflow';
import * as yaml from 'yaml';

// Function to load and parse OpenAPI specification
export async function loadOpenApiSpec(url: string): Promise<any> {
	url = url.trim(); // Trim whitespace
	if (!url) {
		throw new Error('OpenAPI URL is empty. Please provide a valid URL.');
	}

	// Validate URL format
	let apiUrl: URL;
	try {
		apiUrl = new URL(url);
	} catch (error) {
		throw new Error(`Invalid URL format: ${url}. Please provide a valid URL.`);
	}

	// Fetch the OpenAPI spec
	const response = await fetch(apiUrl.toString(), {
		headers: {
			'Accept': 'application/json, application/yaml, text/yaml',
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
	}

	// Get the content type to determine parsing method
	const contentType = response.headers.get('content-type') || '';
	const text = await response.text();

	// Parse response based on content type or file extension
	try {
		// Check if it's a YAML response (either by content type or file extension)
		if (contentType.includes('yaml') ||
			contentType.includes('yml') ||
			url.toLowerCase().endsWith('.yaml') ||
			url.toLowerCase().endsWith('.yml')) {
			return yaml.parse(text);
		} else {
			// Default to JSON parsing
			return JSON.parse(text);
		}
	} catch (error) {
		throw new Error(`Failed to parse response: ${error.message}. Make sure the URL returns valid JSON or YAML.`);
	}
}

// Resolve internal $ref pointers (e.g. '#/components/parameters/Limit') within the spec.
// External references are returned unchanged.
export function resolveRef(spec: any, obj: any): any {
	let current = obj;
	const seen = new Set<string>();

	while (current && typeof current === 'object' && typeof current.$ref === 'string') {
		const ref = current.$ref as string;
		if (!ref.startsWith('#/') || seen.has(ref)) {
			return current;
		}
		seen.add(ref);

		let resolved: any = spec;
		for (const segment of ref.slice(2).split('/')) {
			// JSON pointer escaping: ~1 = '/', ~0 = '~'
			resolved = resolved?.[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
		}

		if (resolved === undefined) {
			return current;
		}
		current = resolved;
	}

	return current;
}

export interface IOperationParameter {
	name: string;
	in: 'query' | 'path' | 'header' | 'cookie';
	required: boolean;
	description?: string;
	schema?: any;
}

export interface IOperationDetails {
	parameters: IOperationParameter[];
	requestBodySchema?: any;
	requestBodyRequired: boolean;
}

// Extract the parameters and request body schema defined in the spec for a single operation.
// Supports both OpenAPI 3.x (requestBody) and Swagger 2.0 (in: 'body' parameters).
export function getOperationDetails(spec: any, method: string, path: string): IOperationDetails {
	const details: IOperationDetails = { parameters: [], requestBodyRequired: false };

	const pathItem = resolveRef(spec, spec?.paths?.[path]);
	const operation = pathItem?.[method.toLowerCase()];
	if (!operation || typeof operation !== 'object') {
		return details;
	}

	// Operation-level parameters override path-level ones with the same name and location
	const merged = new Map<string, IOperationParameter>();
	const rawParameters = [
		...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
		...(Array.isArray(operation.parameters) ? operation.parameters : []),
	];

	for (const rawParam of rawParameters) {
		const param = resolveRef(spec, rawParam);
		if (!param?.name || !param?.in) continue;

		if (param.in === 'body') {
			// Swagger 2.0 style request body
			details.requestBodySchema = resolveRef(spec, param.schema);
			details.requestBodyRequired = param.required === true;
			continue;
		}

		if (!['query', 'path', 'header', 'cookie'].includes(param.in)) continue;

		merged.set(`${param.in}:${param.name}`, {
			name: param.name,
			in: param.in,
			required: param.in === 'path' ? true : param.required === true,
			description: param.description,
			// Swagger 2.0 puts type/enum directly on the parameter instead of under schema
			schema: resolveRef(spec, param.schema ?? (param.type ? param : undefined)),
		});
	}
	details.parameters = [...merged.values()];

	// OpenAPI 3.x request body (first JSON-like content type)
	const requestBody = resolveRef(spec, operation.requestBody);
	if (requestBody?.content) {
		const jsonContentKey = Object.keys(requestBody.content).find((key) => key.includes('json'));
		if (jsonContentKey) {
			details.requestBodySchema = resolveRef(spec, requestBody.content[jsonContentKey].schema);
			details.requestBodyRequired = requestBody.required === true;
		}
	}

	return details;
}

// Map an OpenAPI/JSON schema to the field type used by n8n's resource mapper UI
export function mapSchemaToFieldType(schema: any): { type: FieldType; options?: INodePropertyOptions[] } {
	if (!schema || typeof schema !== 'object') {
		return { type: 'string' };
	}

	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		return {
			type: 'options',
			options: schema.enum.map((value: unknown) => ({ name: String(value), value: value as string })),
		};
	}

	switch (schema.type) {
		case 'integer':
		case 'number':
			return { type: 'number' };
		case 'boolean':
			return { type: 'boolean' };
		case 'array':
			return { type: 'array' };
		case 'object':
			return { type: 'object' };
		case 'string':
			return { type: schema.format === 'date-time' ? 'dateTime' : 'string' };
		default:
			return { type: 'string' };
	}
}

export interface ISplitMappedParameters {
	parameters: IDataObject[];
	bodyFields: IDataObject;
}

// Split resource mapper values (keyed as '<location>:<name>') into request parameters
// (compatible with the manual parameters collection) and request body fields
export function splitMappedParameters(mapped: IDataObject): ISplitMappedParameters {
	const parameters: IDataObject[] = [];
	const bodyFields: IDataObject = {};

	for (const [id, value] of Object.entries(mapped)) {
		if (value === undefined || value === null || value === '') continue;

		const separatorIndex = id.indexOf(':');
		if (separatorIndex === -1) continue;

		const location = id.slice(0, separatorIndex);
		const name = id.slice(separatorIndex + 1);

		if (location === 'body') {
			bodyFields[name] = value;
		} else if (['query', 'path', 'header', 'cookie'].includes(location)) {
			parameters.push({
				name,
				value: typeof value === 'object' ? JSON.stringify(value) : String(value),
				type: location,
			});
		}
	}

	return { parameters, bodyFields };
}

// Helper function to join URL parts correctly
function joinURLParts(base: string, path: string): string {
	if (!base) return path;

	// Remove trailing slash from base if present
	const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

	// Remove leading slash from path if present
	const cleanPath = path.startsWith('/') ? path : `/${path}`;

	return `${cleanBase}${cleanPath}`;
}

export interface IRequestOptions {
	responseFormat?: 'json' | 'string' | 'binary';
	timeout?: number;
}

export interface IBinaryResponse {
	buffer: Buffer;
	contentType?: string;
}

// Function to execute an API request based on the OpenAPI specification
export async function executeOpenApiRequest(
	spec: any,
	method: string,
	path: string,
	parameters: IDataObject,
	requestBody: IDataObject,
	credentials?: IDataObject,
	baseApiUrl?: string,
	requestOptions?: IRequestOptions,
): Promise<any> {
	// Use baseApiUrl if provided, otherwise get server URL from the OpenAPI spec
	let serverUrl = '';

	if (baseApiUrl) {
		serverUrl = baseApiUrl;
	} else if (spec.servers && spec.servers.length > 0) {
		serverUrl = spec.servers[0].url;

		// Handle relative server URLs - a common issue in many OpenAPI specs
		if (serverUrl && !serverUrl.match(/^https?:\/\//)) {
			throw new Error(`The OpenAPI spec contains a relative server URL (${serverUrl}). Please provide a base API URL in the node configuration.`);
		}
	}

	if (!serverUrl) {
		throw new Error('No server URL found in the OpenAPI spec and no base API URL provided. Please provide a base API URL in the node configuration.');
	}

	// Prepare the request URL - join server URL and path correctly
	const urlPath = joinURLParts(serverUrl, path);

	// Process path parameters
	let finalUrl = urlPath;
	if (parameters && Array.isArray(parameters.parameter)) {
		const pathParams = parameters.parameter.filter((param: IDataObject) => param.type === 'path');
		for (const param of pathParams) {
			finalUrl = finalUrl.replace(`{${param.name}}`, param.value as string);
		}
	}

	// Prepare query parameters
	const queryParams = new URLSearchParams();
	if (parameters && Array.isArray(parameters.parameter)) {
		const queryParamItems = parameters.parameter.filter((param: IDataObject) => param.type === 'query');
		for (const param of queryParamItems) {
			queryParams.append(param.name as string, param.value as string);
		}
	}

	// Prepare headers
	const headers: Record<string, string> = {};
	if (parameters && Array.isArray(parameters.parameter)) {
		const headerParams = parameters.parameter.filter((param: IDataObject) => param.type === 'header');
		for (const param of headerParams) {
			headers[param.name as string] = param.value as string;
		}

		// Cookie parameters are sent via the Cookie header
		const cookieParams = parameters.parameter.filter((param: IDataObject) => param.type === 'cookie');
		if (cookieParams.length > 0) {
			headers['Cookie'] = cookieParams
				.map((param: IDataObject) => `${param.name}=${param.value}`)
				.join('; ');
		}
	}

	// Handle authentication if credentials are provided
	if (credentials && Object.keys(credentials).length > 0 && spec.components?.securitySchemes) {
		// Check if there's API key authentication
		const apiKeyScheme = Object.values(spec.components.securitySchemes).find(
			(scheme: any) => scheme.type === 'apiKey'
		) as any;

		if (apiKeyScheme) {
			const apiKeyName = apiKeyScheme.name;
			const apiKeyValue = credentials[apiKeyName] || credentials.apiKey;

			if (apiKeyValue) {
				if (apiKeyScheme.in === 'header') {
					// Add API key to headers
					headers[apiKeyName] = apiKeyValue as string;
				} else if (apiKeyScheme.in === 'query') {
					// Add API key to query parameters
					queryParams.append(apiKeyName, apiKeyValue as string);
				}
			}
		}

		// Handle basic auth
		const basicAuthScheme = Object.values(spec.components.securitySchemes).find(
			(scheme: any) => scheme.type === 'http' && scheme.scheme === 'basic'
		);
		if (basicAuthScheme && credentials.username && credentials.password) {
			// Base64 encode username:password
			const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
			headers['Authorization'] = `Basic ${auth}`;
		}

		// Handle bearer token
		const bearerAuthScheme = Object.values(spec.components.securitySchemes).find(
			(scheme: any) => scheme.type === 'http' && scheme.scheme === 'bearer'
		);
		if (bearerAuthScheme && credentials.token) {
			headers['Authorization'] = `Bearer ${credentials.token}`;
		}
	}

	// Add query parameters to URL if there are any
	const url = queryParams.toString() ? `${finalUrl}?${queryParams.toString()}` : finalUrl;

	// Determine if method supports request body
	const methodsWithoutBody = ['GET', 'HEAD', 'DELETE', 'OPTIONS'];
	const methodSupportsBody = !methodsWithoutBody.includes(method.toUpperCase());

	// Configure request options
	const options: RequestInit = {
		method: method.toUpperCase(),
		headers,
	};

	// Abort the request if it takes longer than the configured timeout
	if (requestOptions?.timeout && requestOptions.timeout > 0) {
		options.signal = AbortSignal.timeout(requestOptions.timeout);
	}

	// Only add body for methods that support it and if there's actually content
	if (methodSupportsBody && requestBody && Object.keys(requestBody).length > 0) {
		options.body = JSON.stringify(requestBody);
	}

	// Execute the request
	try {
		const response = await fetch(url, options);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Request failed with status code ${response.status}: ${errorText}`);
		}

		const responseFormat = requestOptions?.responseFormat || 'json';

		if (responseFormat === 'string') {
			return await response.text();
		}

		if (responseFormat === 'binary') {
			const arrayBuffer = await response.arrayBuffer();
			const binaryResponse: IBinaryResponse = {
				buffer: Buffer.from(arrayBuffer),
				contentType: response.headers?.get('content-type') || undefined,
			};
			return binaryResponse;
		}

		return await response.json();
	} catch (error) {
		throw error instanceof Error ? error : new Error(String(error));
	}
}

