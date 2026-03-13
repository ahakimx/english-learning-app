import { Amplify } from 'aws-amplify';

const region = import.meta.env.VITE_AWS_REGION ?? 'us-east-1';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID ?? '',
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
      identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID ?? '',
      loginWith: { email: true },
    },
  },
  Storage: {
    S3: {
      bucket: import.meta.env.VITE_AUDIO_BUCKET_NAME ?? '',
      region,
    },
  },
});
