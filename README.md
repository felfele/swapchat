# SwapChat

SwapChat is a disposable, end-to-end encrypted, decentralized web app built on [Ethereum Swarm Bee](https://github.com/ethersphere/bee). It uses ephemeral identities generated on the fly and then it does a Diffie-Hellman key exchange to create a shared secret for reasonable security and privacy.

The project was initally done as a Swarm Hackweek Madrid 2019 project as a collaboration between [@nolash](https://github.com/nolash) from the [Swarm team](https://swarm.ethereum.org/) and [@significance](https://github.com/significance) from [Fair Data Society](https://github.com/fairDataSociety) and [@agazso](https://github.com/agazso) from [Felfele](https://github.com/felfele).

[<img src="screenshot.png" width=800>](screenshot.png)

### Building and running the app

First, ensure you are using a (somewhat old enough) version of node:

```
 $ nvm use lts/fermium
```

Second, install the dependencies:

```
 $ npm install
```

Then build the app:

```
 $ npm run pack-html-only
```

This builds the app in a single html file in the `dist` directory. You can upload it to Bee with the `upload.sh` command (curl is required):

```
 $ ./upload.sh http://localhost:8080
```
You can specify any Bee gateways as an argument. After the upload was successful the script will write out a link to the uploaded website. Copy that link to your browser to open it.

### Testing

To test the connection logic:

1. run ts-node ./src/index.ts in terminal 1, and while running...
1. look for `tmp priv: <HASH>` in the output, and copy the hash
1. run ts-node ./src/index.ts <HASH> in terminal 2
