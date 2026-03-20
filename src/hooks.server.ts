import { handleLogto } from '@logto/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$env/dynamic/private';

const logtoHook = handleLogto(
	{
		endpoint: env.LOGTO_ENDPOINT,
		appId: env.LOGTO_APP_ID,
		appSecret: env.LOGTO_APP_SECRET,
		resources: [env.LOGTO_API_IDENTIFIER!]
	},
	{ encryptionKey: env.LOGTO_COOKIE_ENCRYPTION_KEY }
);

export const handle = sequence(logtoHook);
