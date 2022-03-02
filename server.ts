
import express, { Express, Request, Response } from 'express';
import { Quote } from './cli/commands/quote';

const port = 5050;

const app: Express = express();
app.use(express.json());

app.post('/quote', async (request: Request, response: Response) => {
    var tokenIn = request.body.tokenIn || '';
    var tokenOut = request.body.tokenOut || '';
    var amount = request.body.amount || '';
    var exactIn = request.body.exactIn || '';
    var minSplits = request.body.minSplits || '';
    var router = request.body.alpha || '';
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

    // Execute command
    var something = await Quote.run(params);

    console.log(something);

    response.status(200).json();
})


app.get('/quoteToRatio', (request: Request, response: Response) => {
    console.log(request.cookies);


    response.type('text/plain');
    response.send('/quoteToRatio');
})

app.listen(port, () => {
    console.log(`server is running on http://localhost:${port}`)
}
);
