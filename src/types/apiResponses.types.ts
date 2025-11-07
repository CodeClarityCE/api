import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { TypedPaginatedData } from './pagination.types';

/**
 * Enum representing a status.
 */
export enum Status {
    /**
     * Success status.
     */
    Success = 'success',
    /**
     * Failure status.
     */
    Failure = 'failure'
}

/**
 * Interface for paginated response data.
 */
export interface PaginatedResponse {
    /**
     * The data returned by the API call.
     */
    data: unknown;
    /**
     * The current page number.
     */
    page: number;
    /**
     * The total count of entries.
     */
    entry_count: number;
    /**
     * The number of entries per page.
     */
    entries_per_page: number;
    /**
     * The total number of entries across all pages.
     */
    total_entries: number;
    /**
     * The total number of pages.
     */
    total_pages: number;
    /**
     * The count of matching entries.
     */
    matching_count: number;
    /**
     * An object containing filter counts for each key.
     */
    filter_count: Record<string, number>;
}

/**
 * Empty response class indicating no data was returned.
 */
export class NoDataResponse {}

/**
 * Response class with generic type, used to handle responses from the API.
 */
export class Response {
    /**
     * The data returned by the API call.
     */
    @ApiProperty()
    data!: unknown;
}

/**
 * Created response class with an ID property.
 */
export class CreatedResponse {
    /**
     * Unique identifier of the created resource.
     */
    @ApiProperty()
    id!: string;
}

/**
 * Typed response class, used to handle responses from the API where the type is known.
 *
 * @param {Type} Type - The type of the data returned by the API call.
 */
export class TypedResponse<Type> {
    /**
     * The data returned by the API call.
     */
    @ApiProperty()
    data!: Type;
}

/**
 * Typed paginated response class, used to handle paginated responses from the API where the type is known.
 *
 * @param {Type} Type - The type of the data in each entry of the pagination.
 */
export class TypedPaginatedResponse<Type> implements TypedPaginatedData<Type> {
    /**
     * An array of entries returned by the API call.
     */
    @ApiProperty()
    data!: Type[];

    /**
     * The current page number.
     */
    @ApiProperty()
    page!: number;

    /**
     * The total count of entries.
     */
    @ApiProperty()
    entry_count!: number;

    /**
     * The number of entries per page, not included in the API response (used by pagination).
     */
    @ApiResponseProperty()
    entries_per_page!: number;

    /**
     * The total number of entries across all pages.
     */
    @ApiProperty()
    total_entries!: number;

    /**
     * The total number of pages.
     */
    @ApiProperty()
    total_pages!: number;

    /**
     * The count of matching entries.
     */
    @ApiProperty()
    matching_count!: number;

    /**
     * An object containing filter counts for each key.
     */
    @ApiProperty()
    filter_count!: Record<string, number>;
}
