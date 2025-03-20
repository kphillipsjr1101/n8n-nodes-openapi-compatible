import { describe, it, expect } from 'vitest';
import { openApiOperations, openApiFields } from '../nodes/OpenAPINode/OpenApiDescription';

describe('OpenApiDescription', () => {
	describe('openApiOperations', () => {
		it('should be an array of INodeProperties', () => {
			expect(Array.isArray(openApiOperations)).toBe(true);
			openApiOperations.forEach((operation) => {
				expect(typeof operation).toBe('object');
			});
		});

		it('should contain an operation with required properties', () => {
			const operation = openApiOperations.find((op) => op.name === 'operation');
			expect(operation).toBeDefined();
			if (operation) {
				expect(operation.displayName).toBe('Operation Name or ID');
				expect(operation.type).toBe('options');
				expect(operation.required).toBe(true);
				expect(operation.default).toBe('');
				expect(operation.typeOptions).toBeDefined();
				expect(operation.typeOptions?.loadOptionsMethod).toBe('loadOperations');
			}
		});
	});

	describe('openApiFields', () => {
		it('should be an array of INodeProperties', () => {
			expect(Array.isArray(openApiFields)).toBe(true);
			openApiFields.forEach((field) => {
				expect(typeof field).toBe('object');
			});
		});

		it('should include a Parameters field of fixedCollection type', () => {
			const parametersField = openApiFields.find((field) => field.name === 'parameters');
			expect(parametersField).toBeDefined();
			if (parametersField) {
				expect(parametersField.type).toBe('fixedCollection');
				expect(parametersField.options).toBeDefined();
				if (parametersField.options) {
					const parameterOption = parametersField.options.find((option: any) => option.name === 'parameter');
					expect(parameterOption).toBeDefined();
					if (parameterOption) {
						const values = (parameterOption as { values: any[] }).values;
						expect(Array.isArray(values)).toBe(true);
						const nameField = values.find((v: any) => v.name === 'name');
						const valueField = values.find((v: any) => v.name === 'value');
						const typeField = values.find((v: any) => v.name === 'type');
						expect(nameField).toBeDefined();
						expect(valueField).toBeDefined();
						expect(typeField).toBeDefined();
					}
				}
			}
		});

		it('should include a Request Body field with json type', () => {
			const requestBodyField = openApiFields.find((field) => field.name === 'requestBody');
			expect(requestBodyField).toBeDefined();
			if (requestBodyField) {
				expect(requestBodyField.type).toBe('json');
				expect(requestBodyField.default).toBe('{}');
			}
		});

		it('should include an Options field of collection type with required options', () => {
			const optionsField = openApiFields.find((field) => field.name === 'options');
			expect(optionsField).toBeDefined();
			if (optionsField) {
				expect(optionsField.type).toBe('collection');
				expect(optionsField.options).toBeDefined();
				if (optionsField.options) {
					const responseFormatOption = optionsField.options.find((option: any) => option.name === 'responseFormat');
					const timeoutOption = optionsField.options.find((option: any) => option.name === 'timeout');
					expect(responseFormatOption).toBeDefined();
					expect(timeoutOption).toBeDefined();
				}
			}
		});
	});
});
