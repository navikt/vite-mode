# About

Provides a vite dev-mode, where the deployed node express server can "mirror" your localhost vite dev-server. 
This allows your webapp/devserver to access your development or production environment, making mocking of other services unnecessary.
Use with care, and ideally strong request validation on the API side.

#### Access with PAT(public access token)

The package `@navikt/vite-mode` resides in the navikt github package registry. A token is required to access it.

1. Create a (legacy) [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) token.
2. Give the token the `read:packages` scope, and authorize the token to access the navikt organization. 
3. Login with `npm login --registry=https://npm.pkg.github.com --auth-type=legacy`. Username is your github user, and the password will be the token you created in step 1.

### Assets
In order to make loading assets work locally you need to add the following to your `vite.config`
```
server: {
    origin: "http://localhost:$PORT", <-- replace $PORT with the actual port where vite dev-server is running
  },
```
