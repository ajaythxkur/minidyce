import { Buffer } from 'buffer'
window.Buffer = Buffer
window.process = { env: { NODE_ENV: 'development' } }

import React from 'react'
import ReactDOM from 'react-dom/client'
import "@initia/interwovenkit-react/styles.css"
import { injectStyles, InterwovenKitProvider, TESTNET } from "@initia/interwovenkit-react"
import InterwovenKitStyles from "@initia/interwovenkit-react/styles.js"
import { WagmiProvider, createConfig, http } from "wagmi"
import { mainnet } from "wagmi/chains"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import App from './App.jsx'
import './index.css'

injectStyles(InterwovenKitStyles)

const queryClient = new QueryClient()
const wagmiConfig = createConfig({ chains: [mainnet], transports: { [mainnet.id]: http() } })

const customChain = {
  chain_id: 'local-rollup-1',
  chain_name: 'minidyce',
  pretty_name: 'MiniDyce',
  network_type: 'testnet',
  bech32_prefix: 'init',
  logo_URIs: {
    png: 'https://raw.githubusercontent.com/initia-labs/initia-registry/main/testnets/initia/images/initia.png',
    svg: 'https://raw.githubusercontent.com/initia-labs/initia-registry/main/testnets/initia/images/initia.svg',
  },
  apis: {
    rpc: [{ address: 'http://localhost:26657' }],
    rest: [{ address: 'http://localhost:1317' }],
    indexer: [{ address: 'http://localhost:8080' }],
  },
  fees: { fee_tokens: [{ denom: 'umin', fixed_min_gas_price: 0, low_gas_price: 0, average_gas_price: 0, high_gas_price: 0 }] },
  staking: { staking_tokens: [{ denom: 'umin' }] },
  metadata: { is_l1: false, minitia: { type: 'minimove' } },
  native_assets: [{ denom: 'umin', name: 'Min Token', symbol: 'MIN', decimals: 6 }],
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InterwovenKitProvider
          {...TESTNET}
          defaultChainId={customChain.chain_id}
          customChain={customChain}
          customChains={[customChain]}
          enableAutoSign={true}
        >
          <App />
        </InterwovenKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
