import { IDataObject } from 'n8n-workflow';
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

// Helper function to join URL parts correctly
function joinURLParts(base: string, path: string): string {
	if (!base) return path;

	// Remove trailing slash from base if present
	const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

	// Remove leading slash from path if present
	const cleanPath = path.startsWith('/') ? path : `/${path}`;

	return `${cleanBase}${cleanPath}`;
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

		return await response.json();
	} catch (error) {
		throw error instanceof Error ? error : new Error(String(error));
	}
}

