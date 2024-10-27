import { SetMetadata } from '@nestjs/common';

export const SKIP_AUTH_KEY = 'AUTH_END_POINT_DISABLE';
export const NonAuthEndpoint = () => SetMetadata(SKIP_AUTH_KEY, true);
