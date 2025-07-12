import { plainToClass } from 'class-transformer';
import { OptionalTransform } from './transformer';

describe('OptionalTransform', () => {
    class TestClass {
        @OptionalTransform((value: string) => new Date(value))
        date?: Date;

        @OptionalTransform((value: string) => value.toUpperCase())
        text?: string;

        @OptionalTransform((value: string) => parseInt(value, 10))
        number?: number;

        @OptionalTransform((value: string) => value === 'true')
        boolean?: boolean;

        @OptionalTransform((value: any) => JSON.parse(value))
        json?: object;
    }

    describe('with null values', () => {
        it('should return undefined for null date', () => {
            const plainObject = { date: null };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.date).toBeUndefined();
        });

        it('should return undefined for null text', () => {
            const plainObject = { text: null };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.text).toBeUndefined();
        });

        it('should return undefined for null number', () => {
            const plainObject = { number: null };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.number).toBeUndefined();
        });

        it('should return undefined for null boolean', () => {
            const plainObject = { boolean: null };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.boolean).toBeUndefined();
        });

        it('should return undefined for null json', () => {
            const plainObject = { json: null };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.json).toBeUndefined();
        });
    });

    describe('with undefined values', () => {
        it('should return undefined for undefined date', () => {
            const plainObject = { date: undefined };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.date).toBeUndefined();
        });

        it('should return undefined for undefined text', () => {
            const plainObject = { text: undefined };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.text).toBeUndefined();
        });

        it('should return undefined for undefined number', () => {
            const plainObject = { number: undefined };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.number).toBeUndefined();
        });

        it('should return undefined for undefined boolean', () => {
            const plainObject = { boolean: undefined };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.boolean).toBeUndefined();
        });

        it('should return undefined for undefined json', () => {
            const plainObject = { json: undefined };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.json).toBeUndefined();
        });
    });

    describe('with valid values', () => {
        it('should transform valid date string', () => {
            const plainObject = { date: '2023-01-01T00:00:00Z' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.date).toBeInstanceOf(Date);
            expect(transformed.date?.getFullYear()).toBe(2023);
        });

        it('should transform valid text string', () => {
            const plainObject = { text: 'hello world' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.text).toBe('HELLO WORLD');
        });

        it('should transform valid number string', () => {
            const plainObject = { number: '42' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.number).toBe(42);
        });

        it('should transform valid boolean string', () => {
            const plainObject = { boolean: 'true' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.boolean).toBe(true);
        });

        it('should transform valid json string', () => {
            const plainObject = { json: '{"key": "value"}' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.json).toEqual({ key: 'value' });
        });
    });

    describe('with edge cases', () => {
        it('should handle empty string', () => {
            const plainObject = { text: '' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.text).toBe('');
        });

        it('should handle zero', () => {
            const plainObject = { number: '0' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.number).toBe(0);
        });

        it('should handle false boolean', () => {
            const plainObject = { boolean: 'false' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.boolean).toBe(false);
        });

        it('should handle invalid date string', () => {
            const plainObject = { date: 'invalid-date' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.date).toBeInstanceOf(Date);
            expect(transformed.date?.toString()).toBe('Invalid Date');
        });

        it('should handle invalid number string', () => {
            const plainObject = { number: 'not-a-number' };
            const transformed = plainToClass(TestClass, plainObject);
            expect(transformed.number).toBeNaN();
        });

        it('should handle invalid json string', () => {
            const plainObject = { json: 'invalid-json' };
            expect(() => plainToClass(TestClass, plainObject)).toThrow();
        });
    });

    describe('with multiple properties', () => {
        it('should transform multiple properties correctly', () => {
            const plainObject = {
                date: '2023-01-01T00:00:00Z',
                text: 'hello',
                number: '123',
                boolean: 'true',
                json: '{"test": true}'
            };
            const transformed = plainToClass(TestClass, plainObject);

            expect(transformed.date).toBeInstanceOf(Date);
            expect(transformed.text).toBe('HELLO');
            expect(transformed.number).toBe(123);
            expect(transformed.boolean).toBe(true);
            expect(transformed.json).toEqual({ test: true });
        });

        it('should handle mixed null and valid values', () => {
            const plainObject = {
                date: null,
                text: 'hello',
                number: null,
                boolean: 'true',
                json: null
            };
            const transformed = plainToClass(TestClass, plainObject);

            expect(transformed.date).toBeUndefined();
            expect(transformed.text).toBe('HELLO');
            expect(transformed.number).toBeUndefined();
            expect(transformed.boolean).toBe(true);
            expect(transformed.json).toBeUndefined();
        });
    });

    describe('type system compatibility', () => {
        it('should work with different transformer types', () => {
            class ComplexClass {
                @OptionalTransform((value: string) => ({
                    parsed: value.split(',').map((s) => s.trim())
                }))
                complexField?: { parsed: string[] };
            }

            const plainObject = { complexField: 'a, b, c' };
            const transformed = plainToClass(ComplexClass, plainObject);

            expect(transformed.complexField).toEqual({
                parsed: ['a', 'b', 'c']
            });
        });

        it('should handle transformer returning objects', () => {
            class ObjectClass {
                @OptionalTransform((value: string) => ({ value, length: value.length }))
                objectField?: { value: string; length: number };
            }

            const plainObject = { objectField: 'test' };
            const transformed = plainToClass(ObjectClass, plainObject);

            expect(transformed.objectField).toEqual({
                value: 'test',
                length: 4
            });
        });
    });

    describe('function behavior', () => {
        it('should return a Transform decorator', () => {
            const transform = OptionalTransform((value: string) => value.toUpperCase());
            expect(typeof transform).toBe('function');
        });

        it('should accept any transformer function', () => {
            const customTransform = (value: any) => `custom_${value}`;
            const decorator = OptionalTransform(customTransform);
            expect(typeof decorator).toBe('function');
        });

        it('should preserve the original transformer logic when value is not null/undefined', () => {
            const mockTransformer = jest.fn((value: string) => value.toUpperCase());
            const decorator = OptionalTransform(mockTransformer);

            class TestClass {
                @decorator
                field?: string;
            }

            const plainObject = { field: 'test' };
            plainToClass(TestClass, plainObject);

            expect(mockTransformer).toHaveBeenCalledWith('test');
        });

        it('should not call the transformer when value is null', () => {
            const mockTransformer = jest.fn((value: string) => value.toUpperCase());
            const decorator = OptionalTransform(mockTransformer);

            class TestClass {
                @decorator
                field?: string;
            }

            const plainObject = { field: null };
            plainToClass(TestClass, plainObject);

            expect(mockTransformer).not.toHaveBeenCalled();
        });

        it('should not call the transformer when value is undefined', () => {
            const mockTransformer = jest.fn((value: string) => value.toUpperCase());
            const decorator = OptionalTransform(mockTransformer);

            class TestClass {
                @decorator
                field?: string;
            }

            const plainObject = { field: undefined };
            plainToClass(TestClass, plainObject);

            expect(mockTransformer).not.toHaveBeenCalled();
        });
    });
});
