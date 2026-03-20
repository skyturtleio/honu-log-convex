export default {
	providers: [
		{
			type: 'customJwt',
			// The API Identifier from your Logto API Resource
			applicationID: process.env.LOGTO_API_IDENTIFIER!,
			// Logto OIDC issuer endpoint
			issuer: process.env.LOGTO_ENDPOINT + '/oidc',
			// Logto JWKS endpoint for token verification
			jwks: process.env.LOGTO_ENDPOINT + '/oidc/jwks',
			// Must match Logto's signing algorithm (RSA)
			algorithm: 'RS256'
		}
	]
};
