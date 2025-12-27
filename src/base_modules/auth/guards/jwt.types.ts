export interface JWTPayload {
  userId: string;
  roles: string[];
  activated: boolean;
}
