import { Transform } from 'class-transformer';

/**
 * This transformer makes a property optional by returning undefined
 * for null or undefined values and transforming the value otherwise.
 *
 * @param type Type of transformation to apply (e.g., Date)
 */
export function OptionalTransform(type: (value: any) => any): PropertyDecorator {
    return Transform(({ value }) => {
        return value === null || value === undefined ? undefined : type(value);
    });
}
