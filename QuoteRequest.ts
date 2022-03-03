export type QuoteRequestParams = {
    tokenInAddress: string
    tokenInChainId: number
    tokenOutAddress: string
    tokenOutChainId: number
    amount: string
    type: string
    recipient?: string
    slippageTolerance?: string
    deadline?: string
    algorithm?: string
    gasPriceWei?: string
    minSplits?: number
    forceCrossProtocol?: boolean
    protocols?: string[] | string
}
