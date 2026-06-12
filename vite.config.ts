// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	resolve: {
		alias: {
			'n8n-workflow': resolve(__dirname, 'tests/__mocks__/n8n-workflow.ts'),
		},
	},
});
