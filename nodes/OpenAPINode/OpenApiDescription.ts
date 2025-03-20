import { INodeProperties } from 'n8n-workflow';

// Define operations for the OpenAPI node
export const openApiOperations: INodeProperties[] = [
	{
		displayName: 'Operation Name or ID',
		name: 'operation',
		type: 'options',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['apiEndpoint'],
			},
		},
		typeOptions: {
			loadOptionsMethod: 'loadOperations',
		},
		default: '',
		required: true,
	},
];

// Define fields for the OpenAPI node
export const openApiFields: INodeProperties[] = [
	{
		displayName: 'Parameters',
		name: 'parameters',
		placeholder: 'Add Parameter',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['apiEndpoint'],
			},
		},
		default: {},
		options: [
			{
				name: 'parameter',
				displayName: 'Parameter',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Name of the parameter',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value of the parameter',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						options: [
							{
								name: 'Query',
								value: 'query',
							},
							{
								name: 'Path',
								value: 'path',
							},
							{
								name: 'Header',
								value: 'header',
							},
							{
								name: 'Cookie',
								value: 'cookie',
							},
						],
						default: 'query',
						description: 'Type of the parameter',
					},
				],
			},
		],
		description: 'Parameters to be sent',
	},
	{
		displayName: 'Request Body',
		name: 'requestBody',
		type: 'json',
		displayOptions: {
			show: {
				resource: ['apiEndpoint'],
				// Remove the hide condition that was causing the error
			},
		},
		default: '{}',  // Changed from undefined to empty object string
		description: 'Request body as JSON (optional)',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['apiEndpoint'],
			},
		},
		options: [
			{
				displayName: 'Response Format',
				name: 'responseFormat',
				type: 'options',
				options: [
					{
						name: 'JSON',
						value: 'json',
					},
					{
						name: 'String',
						value: 'string',
					},
					{
						name: 'Binary',
						value: 'binary',
					},
				],
				default: 'json',
				description: 'The format in which the data gets returned from the URL',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 10000,
				description: 'Time in ms to wait for the request to complete',
			},
		],
	},
];
