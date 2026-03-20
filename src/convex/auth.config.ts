export default {
	providers: [
		{
			type: 'customJwt',
			// The API Identifier from your Logto API Resource
			applicationID: process.env.LOGTO_API_IDENTIFIER!,
			// Must match the `iss` claim in the JWT (what Logto puts in the token)
			issuer: process.env.LOGTO_ENDPOINT + '/oidc',
			// JWKS URL reachable from the Convex backend (Docker container)
			// Uses LOGTO_JWKS_URL to handle Docker networking (host.docker.internal)
			jwks: process.env.LOGTO_JWKS_URL!,
			// Must match Logto's signing algorithm (RSA)
			algorithm: 'RS256'
		}
	]
};
