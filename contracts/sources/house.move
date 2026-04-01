module minidyce::house {
    use std::signer;
    use std::string;
    use std::vector;
    use std::bcs;
    use std::hash;
    use initia_std::coin;
    use initia_std::fungible_asset::Metadata;
    use initia_std::object::{Self, Object, ExtendRef};
    use initia_std::primary_fungible_store;
    use initia_std::block::get_block_info;

    // ========================= Errors =========================
    const E_NOT_ADMIN: u64 = 1;
    const E_NOT_INITIALIZED: u64 = 2;
    const E_ALREADY_INITIALIZED: u64 = 3;
    const E_INSUFFICIENT_HOUSE: u64 = 4;
    const E_BET_TOO_SMALL: u64 = 5;
    const E_BET_TOO_LARGE: u64 = 6;
    const E_BET_PENDING: u64 = 7;
    const E_NO_PENDING_BET: u64 = 8;
    const E_INVALID_REVEAL: u64 = 9;
    const E_REVEAL_TOO_EARLY: u64 = 10;

    // ========================= Constants =========================
    const MIN_BET: u64 = 100000;   // 0.1 token (6 decimals)
    const MAX_BET: u64 = 50000000; // 50 tokens
    const DENOM: vector<u8> = b"umin";
    const HOUSE_SEED: vector<u8> = b"minidyce_house_vault";

    // ========================= Structs =========================

    struct House has key {
        vault_addr: address,
        vault_extend_ref: ExtendRef,
        total_bets: u64,
        total_wagered: u64,
        total_payouts: u64,
        nonce: u64,
    }

    struct PlayerStats has key {
        total_wagered: u64,
        total_won: u64,
        total_lost: u64,
        games_played: u64,
    }

    /// Stores a pending bet during commit-reveal.
    /// Player commits sha256(secret) with their bet, then reveals the secret
    /// in a later block to generate provably fair randomness.
    struct PendingBet has key, drop {
        commit_hash: vector<u8>,
        bet_amount: u64,
        block_height: u64,
        block_timestamp: u64,
    }

    // ========================= Init =========================

    public entry fun init_house(admin: &signer) {
        assert!(signer::address_of(admin) == @minidyce, E_NOT_ADMIN);
        assert!(!exists<House>(@minidyce), E_ALREADY_INITIALIZED);

        let constructor = object::create_named_object(admin, HOUSE_SEED);
        let vault_addr = object::address_from_constructor_ref(&constructor);
        let vault_extend_ref = object::generate_extend_ref(&constructor);

        move_to(admin, House {
            vault_addr,
            vault_extend_ref,
            total_bets: 0,
            total_wagered: 0,
            total_payouts: 0,
            nonce: 0,
        });
    }

    /// Fund the vault with tokens.
    public entry fun fund_house(funder: &signer, amount: u64) acquires House {
        assert!(exists<House>(@minidyce), E_NOT_INITIALIZED);
        let house = borrow_global<House>(@minidyce);
        let metadata = get_metadata();
        coin::transfer(funder, house.vault_addr, metadata, amount);
    }

    /// Withdraw from vault. Admin only.
    public entry fun withdraw_house(admin: &signer, amount: u64) acquires House {
        assert!(signer::address_of(admin) == @minidyce, E_NOT_ADMIN);
        assert!(exists<House>(@minidyce), E_NOT_INITIALIZED);
        let house = borrow_global<House>(@minidyce);
        let vault_signer = object::generate_signer_for_extending(&house.vault_extend_ref);
        let metadata = get_metadata();
        coin::transfer(&vault_signer, signer::address_of(admin), metadata, amount);
    }

    // ========================= Game API =========================

    /// Ensure player stats exist.
    public fun ensure_player(account: &signer) {
        let addr = signer::address_of(account);
        if (!exists<PlayerStats>(addr)) {
            move_to(account, PlayerStats {
                total_wagered: 0,
                total_won: 0,
                total_lost: 0,
                games_played: 0,
            });
        };
    }

    /// Take bet from player, transfer to vault. Validates amounts.
    public fun take_bet(account: &signer, amount: u64, max_multiplier_x100: u64) acquires House {
        assert!(exists<House>(@minidyce), E_NOT_INITIALIZED);
        assert!(amount >= MIN_BET, E_BET_TOO_SMALL);
        assert!(amount <= MAX_BET, E_BET_TOO_LARGE);

        let metadata = get_metadata();
        let house = borrow_global<House>(@minidyce);
        let vault_addr = house.vault_addr;
        let max_payout = (amount * max_multiplier_x100) / 100;
        let vault_balance = primary_fungible_store::balance(vault_addr, metadata);
        assert!(vault_balance >= max_payout, E_INSUFFICIENT_HOUSE);

        coin::transfer(account, vault_addr, metadata, amount);
    }

    /// Player wins: pay payout from vault to player.
    public fun settle_win(player_addr: address, bet_amount: u64, payout: u64) acquires House, PlayerStats {
        let house = borrow_global_mut<House>(@minidyce);
        let vault_signer = object::generate_signer_for_extending(&house.vault_extend_ref);
        let metadata = get_metadata();

        coin::transfer(&vault_signer, player_addr, metadata, payout);

        house.total_bets = house.total_bets + 1;
        house.total_wagered = house.total_wagered + bet_amount;
        house.total_payouts = house.total_payouts + payout;
        house.nonce = house.nonce + 1;

        if (exists<PlayerStats>(player_addr)) {
            let ps = borrow_global_mut<PlayerStats>(player_addr);
            ps.total_wagered = ps.total_wagered + bet_amount;
            if (payout > bet_amount) {
                ps.total_won = ps.total_won + (payout - bet_amount);
            } else {
                ps.total_lost = ps.total_lost + (bet_amount - payout);
            };
            ps.games_played = ps.games_played + 1;
        };
    }

    /// Player loses: house keeps the bet (already in vault).
    public fun settle_loss(player_addr: address, bet_amount: u64) acquires House, PlayerStats {
        let house = borrow_global_mut<House>(@minidyce);
        house.total_bets = house.total_bets + 1;
        house.total_wagered = house.total_wagered + bet_amount;
        house.nonce = house.nonce + 1;

        if (exists<PlayerStats>(player_addr)) {
            let ps = borrow_global_mut<PlayerStats>(player_addr);
            ps.total_wagered = ps.total_wagered + bet_amount;
            ps.total_lost = ps.total_lost + bet_amount;
            ps.games_played = ps.games_played + 1;
        };
    }

    // ========================= Commit-Reveal Randomness =========================

    /// Phase 1: Player commits sha256(secret) along with their bet.
    /// The bet is taken from the player and held in the vault.
    public fun commit(account: &signer, commit_hash: vector<u8>, bet_amount: u64, max_multiplier_x100: u64) acquires House {
        let addr = signer::address_of(account);
        assert!(!exists<PendingBet>(addr), E_BET_PENDING);

        ensure_player(account);
        take_bet(account, bet_amount, max_multiplier_x100);

        let (height, timestamp) = get_block_info();
        move_to(account, PendingBet {
            commit_hash,
            bet_amount,
            block_height: height,
            block_timestamp: timestamp,
        });
    }

    /// Phase 2: Player reveals the secret in a later block.
    /// Verifies the secret matches the commit, then generates a random number
    /// from sha256(secret || commit_block_height || commit_timestamp || player_addr || nonce).
    /// Returns (random_value, bet_amount) for the game module to resolve.
    public fun resolve_commit(player: &signer, secret: vector<u8>, max_exclusive: u64): (u64, u64) acquires House, PendingBet {
        let addr = signer::address_of(player);
        assert!(exists<PendingBet>(addr), E_NO_PENDING_BET);

        let pending = move_from<PendingBet>(addr);

        // Verify secret matches commit hash
        let computed_hash = hash::sha2_256(copy secret);
        assert!(computed_hash == pending.commit_hash, E_INVALID_REVEAL);

        // Ensure reveal is in a different block than commit
        let (current_height, _) = get_block_info();
        assert!(current_height > pending.block_height, E_REVEAL_TOO_EARLY);

        // Generate random from secret + commit-time block data + nonce
        let house = borrow_global_mut<House>(@minidyce);
        house.nonce = house.nonce + 1;

        let seed = secret;
        vector::append(&mut seed, bcs::to_bytes(&pending.block_height));
        vector::append(&mut seed, bcs::to_bytes(&pending.block_timestamp));
        vector::append(&mut seed, bcs::to_bytes(&addr));
        vector::append(&mut seed, bcs::to_bytes(&house.nonce));
        let hash_result = hash::sha2_256(seed);

        // Extract u64 from first 8 bytes of hash
        let val = 0u64;
        let i = 0u64;
        while (i < 8) {
            val = val | ((*vector::borrow(&hash_result, i) as u64) << ((i * 8 as u8)));
            i = i + 1;
        };

        (val % max_exclusive, pending.bet_amount)
    }

    /// Check if a player has a pending bet.
    public fun has_pending_bet(addr: address): bool {
        exists<PendingBet>(addr)
    }

    // ========================= Helpers =========================

    public fun get_metadata(): Object<Metadata> {
        coin::denom_to_metadata(string::utf8(DENOM))
    }

    public fun get_vault_balance(): u64 acquires House {
        let house = borrow_global<House>(@minidyce);
        let metadata = get_metadata();
        primary_fungible_store::balance(house.vault_addr, metadata)
    }

    public fun get_vault_addr(): address acquires House {
        borrow_global<House>(@minidyce).vault_addr
    }

    public fun get_min_bet(): u64 { MIN_BET }
    public fun get_max_bet(): u64 { MAX_BET }

    // ========================= View Functions =========================

    #[view]
    public fun view_house_stats(): (u64, u64, u64, u64) acquires House {
        assert!(exists<House>(@minidyce), E_NOT_INITIALIZED);
        let balance = get_vault_balance();
        let h = borrow_global<House>(@minidyce);
        (balance, h.total_bets, h.total_wagered, h.total_payouts)
    }

    #[view]
    public fun view_player_stats(addr: address): (u64, u64, u64, u64) acquires PlayerStats {
        if (!exists<PlayerStats>(addr)) return (0, 0, 0, 0);
        let ps = borrow_global<PlayerStats>(addr);
        (ps.total_wagered, ps.total_won, ps.total_lost, ps.games_played)
    }

    #[view]
    public fun view_is_initialized(): bool {
        exists<House>(@minidyce)
    }

    #[view]
    public fun view_vault_balance(): u64 acquires House {
        get_vault_balance()
    }

    #[view]
    public fun view_has_pending_bet(addr: address): bool {
        exists<PendingBet>(addr)
    }
}
