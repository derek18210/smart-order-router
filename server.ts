
import express, { Express, Request, Response } from 'express';

const port = 5050;

const app: Express = express();
app.use(express.json());

app.post('/quote', async (request: Request, response: Response) => {
    var tokenIn = request.body.tokenIn || '';
    var tokenOut = request.body.tokenOut || '';
    var amount = request.body.amount || '';
    var exactIn = request.body.exactIn || '';
    var minSplits = request.body.minSplits || '';
    var router = request.body.router || '';
    var chainId = request.body.chainId || '';

    var params: string[] = [];
    params.push("--tokenIn");
    params.push(tokenIn);
    params.push("--tokenOut");
    params.push(tokenOut);
    params.push("--amount");
    params.push(amount);
    params.push("--exactIn");
    params.push(exactIn);
    params.push("--minSplits");
    params.push(minSplits);
    params.push("--router");
    params.push(router);
    params.push("--chainId");
    params.push(chainId);

    const util = require('util');
    const exec = util.promisify(require('child_process').exec);

    async function q() {

        const { stdout } = await exec(`./bin/cli quote --tokenIn ${tokenIn} --tokenOut ${tokenOut} --amount ${amount} --exactIn ${exactIn} --minSplits ${minSplits} --router ${router} --chainId ${chainId}`);

        console.log('stdout:', stdout);

        return stdout;
    }
    var result = await q();

    response.status(200).json(result);
})


app.post('/quoteToRatio', async (request: Request, response: Response) => {
    var token0 = request.body.token0 || '';
    var token1 = request.body.token1 || '';
    var feeAmount = request.body.feeAmount || '';
    var recipient = request.body.recipient || '';
    var token0Balance = request.body.token0Balance || '';
    var token1Balance = request.body.token1Balance || '';
    var tickLower = request.body.tickLower || '';
    var tickUpper = request.body.tickUpper || '';

    const util = require('util');
    const exec = util.promisify(require('child_process').exec);

    async function q() {

        const { stdout } = await exec(`./bin/cli quote-to-ratio --token0 ${token0} --token1 ${token1} --feeAmount ${feeAmount} --recipient ${recipient} --token0Balance ${token0Balance} --token1Balance ${token1Balance} --tickLower ${tickLower} --tickUpper ${tickUpper}`);

        console.log('stdout:', stdout);

        return stdout;
    }
    var result = await q();

    response.status(200).json(result);
})

app.listen(port, () => {
    console.log(`server is running on http://localhost:${port}`)
}
);
