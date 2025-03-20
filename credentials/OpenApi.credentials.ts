import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenApi implements ICredentialType {
	name = 'openApi';
	displayName = 'OpenAPI Auth API';
	documentationUrl = 'https://docs.n8n.io/integrations/creating-nodes/build/credentials/';

	// Define the properties for different authentication methods
	properties: INodeProperties[] = [
		// API Key Authentication
		{
			displayName: 'API Key Name',
			name: 'apiKeyName',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: 'X-API-Key',
			description: 'Name of the API key header or query parameter',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API key value',
		},

		// Basic Authentication
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'Username for Basic Authentication',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Password for Basic Authentication',
		},

		// Bearer Token Authentication
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Bearer token for Authentication',
		},
	];

	// This tells n8n how to use these credentials in a request
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			// Authentication will be handled in the node itself
			// since we need to read the OpenAPI spec to determine the right method
		},
	};

	// Allows the credentials to be tested
	test: { request: { baseURL: string; url: string; } } = {
		request: {
			baseURL: '={{$credentials.url}}',
			url: '/',
		},
	};
}
