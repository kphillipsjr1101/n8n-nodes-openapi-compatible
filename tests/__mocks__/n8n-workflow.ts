// __mocks__/n8n-workflow.ts
export class NodeOperationError extends Error {
	constructor(message: string, description?: string) {
		super(message);
		this.name = 'NodeOperationError';
		// You can store the description if needed
	}
}
