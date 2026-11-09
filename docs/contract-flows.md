# Contract interactions

I use these diagrams to separate token movement from observation. Every resolution arrow requires a successful authorized transaction; neither the API, indexer nor elapsed time executes a payout. [Rules and trade-offs](../README.md#contract-rules), [interface](../contracts/src/IEscrow.sol).

```mermaid
stateDiagram-v2
    [*] --> Pending: Sender creates and funds
    Pending --> CancelledBySender: Sender cancels before 2h
    Pending --> Released: Beneficiary confirms before 7d
    Pending --> Rejected: Beneficiary rejects before 7d
    Pending --> Expired: Sender recovers at or after 7d
    CancelledBySender --> [*]
    Released --> [*]
    Rejected --> [*]
    Expired --> [*]
```

Confirmation pays the beneficiary. Cancellation, rejection and recovery pay the fixed sender. The first successful resolution wins, including during the cancellation window.

## Funding

```mermaid
sequenceDiagram
    actor S as Sender
    participant T as ERC-20
    participant E as Escrow
    S->>T: Approve allowance (separate transaction)
    S->>E: createEscrow(beneficiary, token, amount)
    E->>E: Validate inputs and guard reentrancy
    E->>T: Read balance, transferFrom sender, read balance
    E->>E: Require exact amount received
    E->>E: Store Pending record/deadlines and emit EscrowCreated
    E-->>S: Transaction succeeds
```

A creation failure reverts funding/record/ID changes, but not an earlier separate approval. One deployment holds many IDs; the API does not hold tokens or sign transactions.

## Payout and expiry

```mermaid
flowchart TD
    Call[Authorized wallet submits a resolution] --> Checks{Existing Pending record, correct role and time?}
    Checks -->|No| Revert[Revert without payout]
    Checks -->|Yes| State[Set the selected terminal state]
    State --> Token[SafeERC20 transfer to the stored recipient]
    Token --> Result{Token call accepted?}
    Result -->|No| Revert
    Result -->|Yes| Event[Emit resolution event and commit]
```

Detected reverting/false-returning transfers roll the transaction back to Pending. I assume honest exact-transfer token behavior; a lying success or issuer restriction is not solved by these checks. [Token limitations](../README.md#assumptions-and-limitations).

At exactly 2h, cancellation closes. At exactly 7d, beneficiary decisions close and sender recovery opens. Without recovery, storage remains Pending, tokens stay held and no EscrowExpired event appears. The API derives ExpiredRecoverable using observed chain time. Beneficiary confirmation is a business action; block confirmations are the indexer's configured delay before indexing.
