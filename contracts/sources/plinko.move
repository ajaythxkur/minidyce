module minidyce::plinko {
    use std::signer;
    use std::vector;
    use std::hash;
    use std::bcs;
    use minidyce::house;

    // ========================= Errors =========================
    const E_INVALID_ROWS: u64 = 400;
    const E_INVALID_RISK: u64 = 401;
    const E_NO_PENDING: u64 = 402;

    // ========================= Constants =========================
    const MIN_ROWS: u64 = 6;
    const MAX_ROWS: u64 = 12;
    const RISK_LOW: u8 = 0;
    const RISK_MEDIUM: u8 = 1;

    const MAX_PLINKO_MULT_X100: u64 = 600;

    // ========================= Structs =========================

    struct PendingPlinko has key, drop {
        rows: u64,
        risk: u8,
    }

    struct PlinkoResult has key, drop {
        rows: u64,
        risk: u8,
        bucket: u64,
        multiplier_x100: u64,
        won: bool,
        bet_amount: u64,
        payout: u64,
    }

    // ========================= Commit-Reveal =========================

    /// Phase 1: Commit bet + rows + risk + sha256(secret)
    public entry fun commit_drop(account: &signer, bet_amount: u64, rows: u64, risk: u8, commit_hash: vector<u8>) {
        assert!(rows >= MIN_ROWS && rows <= MAX_ROWS, E_INVALID_ROWS);
        assert!(risk == RISK_LOW || risk == RISK_MEDIUM, E_INVALID_RISK);
        let addr = signer::address_of(account);
        assert!(!exists<PendingPlinko>(addr), E_NO_PENDING);

        house::commit(account, commit_hash, bet_amount, MAX_PLINKO_MULT_X100);
        move_to(account, PendingPlinko { rows, risk });
    }

    /// Phase 2: Reveal secret, resolve game.
    /// Uses the reveal seed to generate multiple random values for each peg row.
    public entry fun reveal_drop(account: &signer, secret: vector<u8>) acquires PendingPlinko, PlinkoResult {
        let addr = signer::address_of(account);
        assert!(exists<PendingPlinko>(addr), E_NO_PENDING);

        let pending = move_from<PendingPlinko>(addr);

        // Get the base random from commit-reveal (consumes the PendingBet)
        let (base_rand, bet_amount) = house::resolve_commit(account, secret, 10000);

        // Simulate ball dropping through rows using derived randomness.
        // For each row, derive a new random from sha256(base_rand || row_index).
        let rights = 0u64;
        let i = 0u64;
        while (i < pending.rows) {
            let row_seed = bcs::to_bytes(&base_rand);
            vector::append(&mut row_seed, bcs::to_bytes(&i));
            let row_hash = hash::sha2_256(row_seed);
            let row_val = (*vector::borrow(&row_hash, 0) as u64);
            if (row_val >= 128) { rights = rights + 1; };
            i = i + 1;
        };

        let bucket = rights;
        let num_buckets = pending.rows + 1;
        let multiplier_x100 = get_bucket_multiplier(bucket, num_buckets, pending.risk);
        let payout = (bet_amount * multiplier_x100) / 100;
        let won = payout > 0;

        if (payout >= bet_amount) {
            house::settle_win(addr, bet_amount, payout);
        } else if (payout > 0) {
            house::settle_win(addr, bet_amount, payout);
        } else {
            house::settle_loss(addr, bet_amount);
        };

        if (exists<PlinkoResult>(addr)) {
            let r = borrow_global_mut<PlinkoResult>(addr);
            r.rows = pending.rows;
            r.risk = pending.risk;
            r.bucket = bucket;
            r.multiplier_x100 = multiplier_x100;
            r.won = won;
            r.bet_amount = bet_amount;
            r.payout = payout;
        } else {
            move_to(account, PlinkoResult { rows: pending.rows, risk: pending.risk, bucket, multiplier_x100, won, bet_amount, payout });
        };
    }

    // ========================= Multiplier Tables =========================

    fun get_bucket_multiplier(bucket: u64, num_buckets: u64, risk: u8): u64 {
        let center = num_buckets / 2;
        let dist = if (bucket > center) { bucket - center } else { center - bucket };

        if (risk == RISK_LOW) {
            if (dist == 0) { 50 }
            else if (dist == 1) { 70 }
            else if (dist == 2) { 100 }
            else if (dist == 3) { 150 }
            else if (dist == 4) { 200 }
            else if (dist == 5) { 300 }
            else { 400 }
        } else {
            if (dist == 0) { 20 }
            else if (dist == 1) { 40 }
            else if (dist == 2) { 70 }
            else if (dist == 3) { 180 }
            else if (dist == 4) { 300 }
            else if (dist == 5) { 500 }
            else { 600 }
        }
    }

    // ========================= Views =========================

    #[view]
    public fun get_last_result(addr: address): (u64, u8, u64, u64, bool, u64, u64) acquires PlinkoResult {
        if (!exists<PlinkoResult>(addr)) return (0, 0, 0, 0, false, 0, 0);
        let r = borrow_global<PlinkoResult>(addr);
        (r.rows, r.risk, r.bucket, r.multiplier_x100, r.won, r.bet_amount, r.payout)
    }

    #[view]
    public fun get_bucket_multipliers(num_buckets: u64, risk: u8): vector<u64> {
        let mults = vector::empty<u64>();
        let i = 0u64;
        while (i < num_buckets) {
            vector::push_back(&mut mults, get_bucket_multiplier(i, num_buckets, risk));
            i = i + 1;
        };
        mults
    }
}
