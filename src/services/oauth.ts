import { request } from 'undici';
import { getEnv } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { AuthenticationError, ExternalServiceError } from '@/utils/errors.js';
import type { OAuthTokenResponse, OAuthTokenInfo, OAuthClientCredentialsRequest } from '@/types/oauth.js';

export class OAuthService {
  private tokenInfo: OAuthTokenInfo | null = null;
  private refreshPromise: Promise<OAuthTokenInfo> | null = null;
  private readonly env = getEnv();

  private static readonly TOKEN_REFRESH_BUFFER = 60000; // 60 seconds before expiry

  async getValidToken(): Promise<string> {
    if (!this.tokenInfo || this.isTokenExpiringSoon()) {
      const tokenInfo = await this.refreshToken();
      return tokenInfo.accessToken;
    }

    return this.tokenInfo.accessToken;
  }

  async refreshToken(): Promise<OAuthTokenInfo> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const tokenInfo = await this.refreshPromise;
      this.tokenInfo = tokenInfo;
      return tokenInfo;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<OAuthTokenInfo> {
    const startTime = Date.now();
    
    try {
      logger.info('Requesting OAuth token');

      const requestBody: OAuthClientCredentialsRequest = {
        grant_type: 'client_credentials',
        client_id: this.env.OAUTH_CLIENT_ID,
        client_secret: this.env.OAUTH_CLIENT_SECRET,
        ...(this.env.OAUTH_SCOPE && { scope: this.env.OAUTH_SCOPE }),
      };

      const { statusCode, body } = await request(this.env.OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(requestBody as unknown as Record<string, string>).toString(),
        throwOnError: false,
      });

      const responseTime = Date.now() - startTime;
      
      if (statusCode !== 200) {
        const errorText = await body.text();
        logger.error({
          statusCode,
          response: errorText,
          responseTime,
        }, 'OAuth token request failed');

        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError('Invalid OAuth credentials');
        }

        throw new ExternalServiceError(
          'OAuth Provider',
          `Token request failed with status ${statusCode}`,
          undefined,
          { statusCode, response: errorText }
        );
      }

      const tokenResponse: OAuthTokenResponse = await body.json() as OAuthTokenResponse;

      if (!tokenResponse.access_token) {
        throw new AuthenticationError('Invalid token response: missing access_token');
      }

      const tokenInfo: OAuthTokenInfo = {
        accessToken: tokenResponse.access_token,
        tokenType: tokenResponse.token_type || 'Bearer',
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        refreshToken: tokenResponse.refresh_token || '',
        scope: tokenResponse.scope || '',
      };

      logger.info({
        responseTime,
        expiresIn: tokenResponse.expires_in,
        tokenType: tokenInfo.tokenType,
      }, 'OAuth token obtained successfully');

      return tokenInfo;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error({ error, responseTime }, 'Failed to obtain OAuth token');
      
      if (error instanceof AuthenticationError || error instanceof ExternalServiceError) {
        throw error;
      }

      throw new ExternalServiceError(
        'OAuth Provider',
        'Token request failed',
        error as Error
      );
    }
  }

  private isTokenExpiringSoon(): boolean {
    if (!this.tokenInfo) {
      return true;
    }

    return Date.now() >= (this.tokenInfo.expiresAt - OAuthService.TOKEN_REFRESH_BUFFER);
  }

  getAuthorizationHeader(): string | null {
    if (!this.tokenInfo) {
      return null;
    }

    return `${this.tokenInfo.tokenType} ${this.tokenInfo.accessToken}`;
  }

  async getAuthorizationHeaderAsync(): Promise<string> {
    const token = await this.getValidToken();
    const tokenType = this.tokenInfo?.tokenType || 'Bearer';
    return `${tokenType} ${token}`;
  }

  clearToken(): void {
    this.tokenInfo = null;
    this.refreshPromise = null;
    logger.info('OAuth token cleared');
  }

  getTokenInfo(): OAuthTokenInfo | null {
    return this.tokenInfo ? { ...this.tokenInfo } : null;
  }
}

export const oauthService = new OAuthService();