import { Injectable } from "@nestjs/common";
@Injectable()
export class EmailUnsubscriptionService {
  /**
   * Unsubscribes an existing or non-existing user from recieving certain emails from our API
   * @throws {UnsubscriptionTokenInvalidOrExpired} In case the token provider is invalid or has expired
   *
   * @param token The unsubscribe token
   * @param emailHash The email hash
   */
  async unsubscribeViaEmailLink(
    _token: string,
    _emailHash: string,
  ): Promise<void> {
    throw new Error("Not implemented");
  }
}
