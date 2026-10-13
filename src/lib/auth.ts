import { timingSafeEqual } from 'node:crypto';
import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import CredentialsProvider from 'next-auth/providers/credentials';

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Username and password',
    credentials: {
      username: { label: 'Username', type: 'text' },
      password: { label: 'Password', type: 'password' }
    },
    async authorize(credentials) {
      const expectedUsername = process.env.JD_ADMIN_USERNAME || 'admin';
      const expectedPassword = process.env.JD_ADMIN_PASSWORD;
      const suppliedUsername = credentials?.username;
      const suppliedPassword = credentials?.password;

      if (!expectedPassword || suppliedUsername !== expectedUsername || !suppliedPassword) {
        return null;
      }

      const expected = Buffer.from(expectedPassword, 'utf8');
      const supplied = Buffer.from(suppliedPassword, 'utf8');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        return null;
      }

      return { id: 'manual-admin', name: expectedUsername };
    }
  })
];

const tenantId = process.env.AZURE_AD_TENANT_ID;
const clientId = process.env.AZURE_AD_CLIENT_ID;
const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;

if (tenantId && clientId && clientSecret) {
  providers.push(
    AzureADProvider({
      tenantId,
      clientId,
      clientSecret,
      authorization: {
        params: {
          scope: 'openid profile email'
        }
      }
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' }
};
