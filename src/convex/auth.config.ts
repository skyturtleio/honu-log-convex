// In local dev, self-hosted Convex runs in Docker where `localhost` doesn't
// reach the host machine. LOGTO_JWKS_URL (set to host.docker.internal) overrides
// the JWKS endpoint so the container can fetch Logto's signing keys.
// In production, LOGTO_JWKS_URL is unset and we derive it from LOGTO_ENDPOINT.
const jwks =
	process.env.LOGTO_JWKS_URL || process.env.LOGTO_ENDPOINT + '/oidc/jwks';

export default {
	providers: [
		{
			type: 'customJwt',
			applicationID: process.env.LOGTO_API_IDENTIFIER!,
			// Must match the `iss` claim in the JWT
			issuer: process.env.LOGTO_ENDPOINT + '/oidc',
			jwks,
			algorithm: 'RS256'
		}
	]
};
