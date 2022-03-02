import { Command } from '@oclif/command';
import express, { } from 'express';
import { Quote } from './quote';

export class APICommand extends Command {
    async run() {
        const port = 5050;

        try {
            var app = express();
            app.use(express.json());

            app.post("/quote", async (request, res) => {
                // const commandClass = require(`./quote.ts`);

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
                console.log(params);
                var something = await Quote.run(params);
                console.log(something);

                res.status(200).json();

            });



            app.listen(port, () => {
                console.log(`API server running at http://localhost:${port}`);
            });

        } catch (error) {
            // error handling here
        }
    }
}
