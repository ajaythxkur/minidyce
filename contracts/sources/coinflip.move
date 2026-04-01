module minidyce::coinflip {
    use std::signer;
    use minidyce::house;

    // ========================= Errors =========================
    const E_INVALID_CHOICE: u64 = 100;
    const E_NO_PENDING: u64 = 101;

    // ========================= Constants =========================
    const HEADS: u8 = 0;
    const TAILS: u8 = 1;
    const MULTIPLIER_X100: u64 = 200; // x2.00

    // ========================= Structs =========================

    struct PendingCoinflip has key, drop {
        choice: u8,
    }

    struct CoinflipResult has key, drop {
        choice: u8,
        result: u8,
        won: bool,
        bet_amount: u64,
        payout: u64,
    }

    // ========================= Commit-Reveal =========================

    /// Phase 1: Commit bet + choice + sha256(secret)
    public entry fun commit_flip(account: &signer, bet_amount: u64, choice: u8, commit_hash: vector<u8>) {
        assert!(choice == HEADS || choice == TAILS, E_INVALID_CHOICE);
        let addr = signer::address_of(account);
        assert!(!exists<PendingCoinflip>(addr), E_NO_PENDING);

        house::commit(account, commit_hash, bet_amount, MULTIPLIER_X100);
        move_to(account, PendingCoinflip { choice });
    }

    /// Phase 2: Reveal secret, resolve game
    public entry fun reveal_flip(account: &signer, secret: vector<u8>) acquires PendingCoinflip, CoinflipResult {
        let addr = signer::address_of(account);
        assert!(exists<PendingCoinflip>(addr), E_NO_PENDING);

        let pending = move_from<PendingCoinflip>(addr);
        let (rand, bet_amount) = house::resolve_commit(account, secret, 100);

        let result = ((rand % 2) as u8);
        let won = result == pending.choice;
        let payout = if (won) { (bet_amount * MULTIPLIER_X100) / 100 } else { 0 };

        if (won) {
            house::settle_win(addr, bet_amount, payout);
        } else {
            house::settle_loss(addr, bet_amount);
        };

        if (exists<CoinflipResult>(addr)) {
            let r = borrow_global_mut<CoinflipResult>(addr);
            r.choice = pending.choice;
            r.result = result;
            r.won = won;
            r.bet_amount = bet_amount;
            r.payout = payout;
        } else {
            move_to(account, CoinflipResult { choice: pending.choice, result, won, bet_amount, payout });
        };
    }

    // ========================= Views =========================

    #[view]
    public fun get_last_result(addr: address): (u8, u8, bool, u64, u64) acquires CoinflipResult {
        if (!exists<CoinflipResult>(addr)) return (0, 0, false, 0, 0);
        let r = borrow_global<CoinflipResult>(addr);
        (r.choice, r.result, r.won, r.bet_amount, r.payout)
    }

    #[view]
    public fun get_multiplier(): u64 { MULTIPLIER_X100 }
}
