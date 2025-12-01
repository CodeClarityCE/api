import { Transform } from 'class-transformer';

/**
 * This transformer makes a property optional by returning undefined
 * for null or undefined values and transforming the value otherwise.
 *
 * @param type Type of transformation to apply (e.g., Date)
 */
export function OptionalTransform<T>(type: (value: unknown) => T): PropertyDecorator {
    return Transform(({ value }: { value: unknown }) => {
        return value === null || value === undefined ? undefined : type(value);
    });
}
