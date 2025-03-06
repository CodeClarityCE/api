import { TypedPaginatedData } from './pagination.types';
import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';

export enum Status {
    Success = 'success',
    Failure = 'failure'
}

export interface PaginatedResponse {
    data: any;
    page: number;
    entry_count: number;
    entries_per_page: number;
    total_entries: number;
    total_pages: number;
    matching_count: number;
    filter_count: { [key: string]: number };
}

export class NoDataResponse {}

export class Response {
    @ApiProperty()
    data: any;
}

export class CreatedResponse {
    @ApiProperty()
    id: string;
}

export class TypedResponse<Type> {
    @ApiProperty()
    data: Type;
}

export class TypedPaginatedResponse<Type> implements TypedPaginatedData<Type> {
    @ApiProperty()
    data: Type[];

    @ApiProperty()
    page: number;

    @ApiProperty()
    entry_count: number;

    @ApiResponseProperty()
    entries_per_page: number;

    @ApiProperty()
    total_entries: number;

    @ApiProperty()
    total_pages: number;

    @ApiProperty()
    matching_count: number;

    @ApiProperty()
    filter_count: { [key: string]: number };
}
