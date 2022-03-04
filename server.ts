
import express, { Express, Request, Response } from 'express';
import { tokenStringToCurrency, parseSlippageTolerance, parseDeadline, DEFAULT_ROUTING_CONFIG_BY_CHAIN } from './shared';
import { Protocol } from '@uniswap/router-sdk'
import NodeCache from 'node-cache'
import { ethers } from 'ethers'
import { Token } from '@uniswap/sdk-core'
import { QuoteResponse, V2PoolInRoute, V3PoolInRoute } from './schema'
import { Currency, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { default as bunyan, default as Logger } from 'bunyan'

import DEFAULT_TOKEN_LIST from '@uniswap/default-token-list'
import {
    // ID_TO_CHAIN_ID,
    ChainId,
    ID_TO_NETWORK_NAME,
    // NativeCurrencyName,
    // nativeOnChain,
    // parseAmount,
    SwapRoute,
    // ITokenListProvider,
    TokenProvider,
    ITokenProvider,
    CachingTokenListProvider,
    CachingTokenProviderWithFallback,
    UniswapMulticallProvider,
    NodeJSCache,
    AlphaRouterConfig,
    CachingV3PoolProvider,
    V2PoolProvider,
    V3PoolProvider,
    AlphaRouter,
    CachingGasStationProvider,
    OnChainGasPriceProvider,
    EIP1559GasPriceProvider,
    LegacyGasPriceProvider,
    GasPrice,
    IMetric,
    MetricLoggerUnit,
    MetricLogger,
    SwapOptions,
    routeAmountsToString,
    setGlobalLogger
} from './src';

const port = 5050;

const app: Express = express();
app.use(express.json());

app.post('/quote', async (request: Request, response: Response) => {

    var tokenInAddress = request.body.tokenInAddress || '';
    var tokenOutAddress = request.body.tokenOutAddress || '';
    var tokenInChainId = request.body.tokenInChainId || '';
    var tokenOutChainId = request.body.tokenOutChainId || '';
    var type = request.body.type || '';
    var amountRaw = request.body.amount || '';
    var slippageTolerance = request.body.slippageTolerance || '';
    var deadline = request.body.deadline || '';
    var recipient = request.body.recipient || '';
    var minSplits = request.body.minSplits || '';
    var forceCrossProtocol = request.body.forceCrossProtocol || false;
    var protocolsStr = request.body.protocolsStr || '';

    var statusCode: number = 200;
    var errorCode: string = '';
    var detail: string = '';
    try {
        var chainId = tokenInChainId;
        // injected
        const chainName = ID_TO_NETWORK_NAME(chainId)
        const projectId: string = '';

        const url = `https://${chainName}.infura.io/v3/${projectId}`

        let timeout: number
        switch (chainId) {
            case ChainId.ARBITRUM_ONE:
            case ChainId.ARBITRUM_RINKEBY:
                timeout = 8000
                break
            default:
                timeout = 5000
                break
        }

        const provider = new ethers.providers.JsonRpcProvider(
            {
                url: url,
                timeout,
            },
            chainId
        )

        const tokenCache = new NodeJSCache<Token>(new NodeCache({ stdTTL: 3600, useClones: false }))
        const multicall2Provider = new UniswapMulticallProvider(chainId, provider, 375_000)

        var tokenListProvider: CachingTokenListProvider;
        tokenListProvider = new CachingTokenListProvider(chainId, DEFAULT_TOKEN_LIST, new NodeJSCache(new NodeCache()));

        var tokenProvider: ITokenProvider;
        tokenProvider = new CachingTokenProviderWithFallback(
            chainId,
            tokenCache,
            tokenListProvider,
            new TokenProvider(chainId, multicall2Provider)
        )

        var v2PoolProvider: V2PoolProvider = new V2PoolProvider(chainId, multicall2Provider)

        var v3PoolProvider: CachingV3PoolProvider = new CachingV3PoolProvider(
            chainId,
            new V3PoolProvider(chainId, multicall2Provider),
            new NodeJSCache(new NodeCache({ stdTTL: 180, useClones: false })));

        const gasPriceCache = new NodeJSCache<GasPrice>(
            new NodeCache({ stdTTL: 15, useClones: true })
        );

        var router: AlphaRouter = new AlphaRouter({
            provider,
            chainId,
            multicall2Provider: multicall2Provider,
            gasPriceProvider: new CachingGasStationProvider(
                chainId,
                new OnChainGasPriceProvider(
                    chainId,
                    new EIP1559GasPriceProvider(provider),
                    new LegacyGasPriceProvider(provider)
                ),
                gasPriceCache
            ),
        });

        var log: Logger = bunyan.createLogger({
            name: 'Logger',
            serializers: bunyan.stdSerializers,
            level: bunyan.INFO,
        })
        setGlobalLogger(log)

        var metric: IMetric = new MetricLogger();

        var quoteId = '1';

        // Parse user provided token address/symbol to Currency object.
        const before = Date.now()

        const currencyIn = await tokenStringToCurrency(
            tokenListProvider,
            tokenProvider,
            tokenInAddress,
            tokenInChainId,
            log
        )

        const currencyOut = await tokenStringToCurrency(
            tokenListProvider,
            tokenProvider,
            tokenOutAddress,
            tokenOutChainId,
            log
        )

        metric.putMetric('TokenInOutStrToToken', Date.now() - before, MetricLoggerUnit.Milliseconds)

        if (!currencyIn) {
            statusCode = 400;
            errorCode = 'TOKIN_IN_INVALID';
            detail = `Could not find token with address "${tokenInAddress}"`;
            throw new Error();
            // return {
            //     statusCode: 400,
            //     errorCode: 'TOKEN_IN_INVALID',
            //     detail: `Could not find token with address "${tokenInAddress}"`,
            // }
        }

        if (!currencyOut) {
            statusCode = 400;
            errorCode = 'TOKIN_OUT_INVALID';
            detail = `Could not find token with address "${tokenInAddress}"`;
            throw new Error();

            // return {
            //     statusCode: 400,
            //     errorCode: 'TOKEN_OUT_INVALID',
            //     detail: `Could not find token with address "${tokenOutAddress}"`,
            // }
        }

        if (tokenInChainId != tokenOutChainId) {

            statusCode = 400;
            errorCode = 'TOKEN_CHAINS_DIFFERENT';
            detail = `Cannot request quotes for tokens on different chains`;
            throw new Error();

            // return {
            //     statusCode: 400,
            //     errorCode: 'TOKEN_CHAINS_DIFFERENT',
            //     detail: `Cannot request quotes for tokens on different chains`,
            // }
        }

        if (currencyIn.equals(currencyOut)) {

            statusCode = 400;
            errorCode = 'TOKEN_IN_OUT_SAME';
            detail = `tokenIn and tokenOut must be different`;
            throw new Error();

            // return {
            //     statusCode: 400,
            //     errorCode: 'TOKEN_IN_OUT_SAME',
            //     detail: `tokenIn and tokenOut must be different`,
            // }
        }

        let protocols: Protocol[] = []
        if (protocolsStr) {
            for (const protocolStr of protocolsStr) {
                switch (protocolStr.toLowerCase()) {
                    case 'v2':
                        protocols.push(Protocol.V2)
                        break
                    case 'v3':
                        protocols.push(Protocol.V3)
                        break
                    default:

                        statusCode = 400;
                        errorCode = 'INVALID_PROTOCOL';
                        detail = `Invalid protocol specified. Supported protocols: ${JSON.stringify(Object.values(Protocol))}`;
                        throw new Error();

                    // return {
                    //     statusCode: 400,
                    //     errorCode: 'INVALID_PROTOCOL',
                    //     detail: `Invalid protocol specified. Supported protocols: ${JSON.stringify(Object.values(Protocol))}`,
                    // }
                }
            }
        } else if (!forceCrossProtocol) {
            protocols = [Protocol.V3]
        }

        const routingConfig: AlphaRouterConfig = {
            ...DEFAULT_ROUTING_CONFIG_BY_CHAIN(chainId),
            ...(minSplits ? { minSplits } : {}),
            ...(forceCrossProtocol ? { forceCrossProtocol } : {}),
            protocols,
        }

        let swapParams: SwapOptions | undefined = undefined

        // e.g. Inputs of form "1.25%" with 2dp max. Convert to fractional representation => 1.25 => 125 / 10000
        if (slippageTolerance && deadline && recipient) {
            const slippageTolerancePercent = parseSlippageTolerance(slippageTolerance)
            swapParams = {
                deadline: parseDeadline(deadline),
                recipient: recipient,
                slippageTolerance: slippageTolerancePercent,
            }
        }

        let swapRoute: SwapRoute | null
        let amount: CurrencyAmount<Currency>

        let tokenPairSymbol = ''
        let tokenPairSymbolChain = ''
        if (currencyIn.symbol && currencyOut.symbol) {
            tokenPairSymbolChain = `${tokenPairSymbol}/${chainId}`
        }

        const [token0Symbol, token0Address, token1Symbol, token1Address] = currencyIn.wrapped.sortsBefore(
            currencyOut.wrapped
        )
            ? [currencyIn.symbol, currencyIn.wrapped.address, currencyOut.symbol, currencyOut.wrapped.address]
            : [currencyOut.symbol, currencyOut.wrapped.address, currencyIn.symbol, currencyIn.wrapped.address]

        switch (type) {
            case 'exactIn':
                amount = CurrencyAmount.fromRawAmount(currencyIn, JSBI.BigInt(amountRaw))

                log.info(
                    {
                        amountIn: amount.toExact(),
                        token0Address,
                        token1Address,
                        token0Symbol,
                        token1Symbol,
                        tokenInSymbol: currencyIn.symbol,
                        tokenOutSymbol: currencyOut.symbol,
                        tokenPairSymbol,
                        tokenPairSymbolChain,
                        type,
                        routingConfig: routingConfig,
                    },
                    `Exact In Swap: Give ${amount.toExact()} ${amount.currency.symbol}, Want: ${currencyOut.symbol
                    }. Chain: ${chainId}`
                )

                swapRoute = await router.route(amount, currencyOut, TradeType.EXACT_INPUT, swapParams, routingConfig)
                break
            case 'exactOut':
                amount = CurrencyAmount.fromRawAmount(currencyOut, JSBI.BigInt(amountRaw))

                log.info(
                    {
                        amountOut: amount.toExact(),
                        token0Address,
                        token1Address,
                        token0Symbol,
                        token1Symbol,
                        tokenInSymbol: currencyIn.symbol,
                        tokenOutSymbol: currencyOut.symbol,
                        tokenPairSymbol,
                        tokenPairSymbolChain,
                        type,
                        routingConfig: routingConfig,
                    },
                    `Exact Out Swap: Want ${amount.toExact()} ${amount.currency.symbol} Give: ${currencyIn.symbol
                    }. Chain: ${chainId}`
                )

                swapRoute = await router.route(amount, currencyIn, TradeType.EXACT_OUTPUT, swapParams, routingConfig)
                break
            default:
                throw new Error('Invalid swap type')
        }

        if (!swapRoute) {
            log.info(
                {
                    type,
                    tokenIn: currencyIn,
                    tokenOut: currencyOut,
                    amount: amount.quotient.toString(),
                },
                `No route found. 404`
            )
            statusCode = 404;
            errorCode = 'NO_ROUTE';
            detail = 'No route found';
            throw new Error();

            // return {
            //     statusCode: 404,
            //     errorCode: 'NO_ROUTE',
            //     detail: 'No route found',
            // }
        }

        const {
            quote,
            quoteGasAdjusted,
            route,
            estimatedGasUsed,
            estimatedGasUsedQuoteToken,
            estimatedGasUsedUSD,
            gasPriceWei,
            methodParameters,
            blockNumber,
        } = swapRoute

        const routeResponse: Array<V3PoolInRoute[] | V2PoolInRoute[]> = []

        for (const subRoute of route) {
            const { amount, quote, tokenPath } = subRoute

            if (subRoute.protocol == Protocol.V3) {
                const pools = subRoute.route.pools
                const curRoute: V3PoolInRoute[] = []
                for (let i = 0; i < pools.length; i++) {
                    const nextPool = pools[i]
                    const tokenIn = tokenPath[i]
                    const tokenOut = tokenPath[i + 1]

                    let edgeAmountIn = undefined
                    if (i == 0) {
                        edgeAmountIn = type == 'exactIn' ? amount.quotient.toString() : quote.quotient.toString()
                    }

                    let edgeAmountOut = undefined
                    if (i == pools.length - 1) {
                        edgeAmountOut = type == 'exactIn' ? quote.quotient.toString() : amount.quotient.toString()
                    }

                    if (nextPool && tokenIn && tokenOut)

                        curRoute.push({
                            type: 'v3-pool',
                            address: v3PoolProvider.getPoolAddress(nextPool.token0, nextPool.token1, nextPool.fee).poolAddress,
                            tokenIn: {
                                chainId: tokenIn.chainId,
                                decimals: tokenIn.decimals.toString(),
                                address: tokenIn.address,
                                symbol: tokenIn.symbol!,
                            },
                            tokenOut: {
                                chainId: tokenOut.chainId,
                                decimals: tokenOut.decimals.toString(),
                                address: tokenOut.address,
                                symbol: tokenOut.symbol!,
                            },
                            fee: nextPool.fee.toString(),
                            liquidity: nextPool.liquidity.toString(),
                            sqrtRatioX96: nextPool.sqrtRatioX96.toString(),
                            tickCurrent: nextPool.tickCurrent.toString(),
                            amountIn: edgeAmountIn,
                            amountOut: edgeAmountOut,
                        })
                }

                routeResponse.push(curRoute)
            } else if (subRoute.protocol == Protocol.V2) {
                const pools = subRoute.route.pairs
                const curRoute: V2PoolInRoute[] = []
                for (let i = 0; i < pools.length; i++) {
                    const nextPool = pools[i]
                    const tokenIn = tokenPath[i]
                    const tokenOut = tokenPath[i + 1]

                    let edgeAmountIn = undefined
                    if (i == 0) {
                        edgeAmountIn = type == 'exactIn' ? amount.quotient.toString() : quote.quotient.toString()
                    }

                    let edgeAmountOut = undefined
                    if (i == pools.length - 1) {
                        edgeAmountOut = type == 'exactIn' ? quote.quotient.toString() : amount.quotient.toString()
                    }

                    if (nextPool && tokenIn && tokenOut) {

                        const reserve0 = nextPool.reserve0
                        const reserve1 = nextPool.reserve1

                        curRoute.push({
                            type: 'v2-pool',
                            address: v2PoolProvider.getPoolAddress(nextPool.token0, nextPool.token1).poolAddress,
                            tokenIn: {
                                chainId: tokenIn.chainId,
                                decimals: tokenIn.decimals.toString(),
                                address: tokenIn.address,
                                symbol: tokenIn.symbol!,
                            },
                            tokenOut: {
                                chainId: tokenOut.chainId,
                                decimals: tokenOut.decimals.toString(),
                                address: tokenOut.address,
                                symbol: tokenOut.symbol!,
                            },
                            reserve0: {
                                token: {
                                    chainId: reserve0.currency.wrapped.chainId,
                                    decimals: reserve0.currency.wrapped.decimals.toString(),
                                    address: reserve0.currency.wrapped.address,
                                    symbol: reserve0.currency.wrapped.symbol!,
                                },
                                quotient: reserve0.quotient.toString(),
                            },
                            reserve1: {
                                token: {
                                    chainId: reserve1.currency.wrapped.chainId,
                                    decimals: reserve1.currency.wrapped.decimals.toString(),
                                    address: reserve1.currency.wrapped.address,
                                    symbol: reserve1.currency.wrapped.symbol!,
                                },
                                quotient: reserve1.quotient.toString(),
                            },
                            amountIn: edgeAmountIn,
                            amountOut: edgeAmountOut,
                        })
                    }
                }

                routeResponse.push(curRoute)
            }
        }

        const quoteResponse: QuoteResponse = {
            methodParameters,
            blockNumber: blockNumber.toString(),
            amount: amount.quotient.toString(),
            amountDecimals: amount.toExact(),
            quote: quote.quotient.toString(),
            quoteDecimals: quote.toExact(),
            quoteGasAdjusted: quoteGasAdjusted.quotient.toString(),
            quoteGasAdjustedDecimals: quoteGasAdjusted.toExact(),
            gasUseEstimateQuote: estimatedGasUsedQuoteToken.quotient.toString(),
            gasUseEstimateQuoteDecimals: estimatedGasUsedQuoteToken.toExact(),
            gasUseEstimate: estimatedGasUsed.toString(),
            gasUseEstimateUSD: estimatedGasUsedUSD.toExact(),
            gasPriceWei: gasPriceWei.toString(),
            route: routeResponse,
            routeString: routeAmountsToString(route),
            quoteId,
        }

        response.status(200).json(quoteResponse);
    }
    catch (error) {

    }
    finally {
        response.status(statusCode).json({
            detail: detail,
            errorCode: errorCode
        });
    }
})


app.listen(port, () => {
    console.log(`server is running on http://localhost:${port}`)
}
);
