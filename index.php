<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

try {
    $action = $_GET['action'] ?? 'health';
    $pdo = db();

    if ($action === 'health') {
        $pdo->query('SELECT 1'); ok(['service'=>'royal-api','time'=>date(DATE_ATOM)]);
    }
    if ($action === 'csrf') ok(['csrf'=>csrf()]);
    if ($action === 'me') ok(['user'=>user()]);

    if ($action === 'register') {
        check_csrf(); $d=body();
        $username=trim((string)($d['username']??'')); $email=trim((string)($d['email']??'')); $pass=(string)($d['password']??'');
        if (!preg_match('/^[A-Za-z0-9_]{4,32}$/',$username)) fail('Username 4-32 ký tự, chỉ chữ/số/_');
        if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Email không hợp lệ');
        if (strlen($pass)<8) fail('Mật khẩu tối thiểu 8 ký tự');
        $pdo->beginTransaction();
        try {
            $st=$pdo->prepare('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)');
            $st->execute([$username,$email,password_hash($pass,PASSWORD_DEFAULT)]);
            $id=(int)$pdo->lastInsertId();
            $pdo->prepare('INSERT INTO wallets(user_id,balance) VALUES(?,1000000)')->execute([$id]);
            $pdo->prepare('INSERT INTO user_stats(user_id) VALUES(?)')->execute([$id]);
            $pdo->commit();
            $_SESSION['user_id']=$id; session_regenerate_id(true);
            ok(['user'=>user(),'csrf'=>csrf()],201);
        } catch(Throwable $e){ $pdo->rollBack(); if((int)$e->getCode()===23000) fail('Username hoặc email đã tồn tại',409); throw $e; }
    }

    if ($action === 'login') {
        check_csrf(); $d=body(); $login=trim((string)($d['login']??'')); $pass=(string)($d['password']??'');
        $st=$pdo->prepare('SELECT * FROM users WHERE username=? OR email=? LIMIT 1'); $st->execute([$login,$login]); $u=$st->fetch();
        if(!$u || !password_verify($pass,$u['password_hash'])) fail('Sai tài khoản hoặc mật khẩu',401);
        if($u['status']!=='active') fail('Tài khoản không hoạt động',403);
        $_SESSION['user_id']=(int)$u['id']; session_regenerate_id(true);
        $pdo->prepare('UPDATE users SET last_login_at=NOW() WHERE id=?')->execute([(int)$u['id']]);
        ok(['user'=>user(),'csrf'=>csrf()]);
    }
    if ($action === 'logout') { check_csrf(); $_SESSION=[]; session_destroy(); ok(); }

    if ($action === 'wallet') {
        $u=require_user();
        $st=$pdo->prepare('SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 50'); $st->execute([$u['id']]);
        ok(['balance'=>$u['balance'],'transactions'=>$st->fetchAll()]);
    }
    if ($action === 'games') {
        $st=$pdo->query("SELECT id,code,name,category,status,min_bet,max_bet FROM games WHERE status='active' ORDER BY sort_order,id");
        ok(['games'=>$st->fetchAll()]);
    }
    if ($action === 'leaderboard') {
        $st=$pdo->query("SELECT u.username,s.pnl_today,s.wins_today,s.rounds_today FROM user_stats s JOIN users u ON u.id=s.user_id WHERE u.status='active' ORDER BY s.pnl_today DESC LIMIT 50");
        ok(['items'=>$st->fetchAll()]);
    }
    if ($action === 'quests') {
        $u=require_user();
        $st=$pdo->prepare("SELECT q.code,q.name,q.icon,q.target,q.reward,q.metric,COALESCE(uq.progress,0) progress,COALESCE(uq.claimed,0) claimed FROM quests q LEFT JOIN user_quests uq ON uq.quest_id=q.id AND uq.user_id=? WHERE q.status='active' ORDER BY q.sort_order,q.id");
        $st->execute([$u['id']]); ok(['quests'=>$st->fetchAll()]);
    }
    if ($action === 'vip') {
        $u=require_user();
        $st=$pdo->query('SELECT code,name,icon,min_balance,bonus_percent,cashback_percent,max_bet,support_level FROM vip_tiers WHERE status=\'active\' ORDER BY min_balance');
        ok(['balance'=>$u['balance'],'tiers'=>$st->fetchAll()]);
    }
    if ($action === 'chat_list') {
        $st=$pdo->query("SELECT c.id,u.username,c.message,c.created_at FROM chat_messages c JOIN users u ON u.id=c.user_id WHERE c.status='visible' ORDER BY c.id DESC LIMIT 100");
        ok(['messages'=>array_reverse($st->fetchAll())]);
    }
    if ($action === 'chat_send') {
        check_csrf(); $u=require_user(); $d=body(); $msg=trim((string)($d['message']??''));
        if($msg==='') fail('Tin nhắn trống'); if(mb_strlen($msg)>500) fail('Tin nhắn quá dài');
        $pdo->prepare("INSERT INTO chat_messages(user_id,message) VALUES(?,?)")->execute([$u['id'],$msg]); ok();
    }

    // Virtual-balance demo bet ledger. This endpoint records the wager atomically.
    // It intentionally does not process real-money deposits/withdrawals.
    if ($action === 'place_bet') {
        check_csrf(); $u=require_user(); $d=body();
        $gameCode=(string)($d['game']??''); $selection=(string)($d['selection']??''); $amount=(int)($d['amount']??0);
        if($amount<1000) fail('Cược tối thiểu 1,000');
        $g=$pdo->prepare("SELECT * FROM games WHERE code=? AND status='active' LIMIT 1"); $g->execute([$gameCode]); $game=$g->fetch();
        if(!$game) fail('Game không tồn tại',404);
        if($amount>(int)$game['max_bet']) fail('Vượt hạn mức game');
        $pdo->beginTransaction();
        try {
            $w=$pdo->prepare('SELECT balance FROM wallets WHERE user_id=? FOR UPDATE'); $w->execute([$u['id']]); $bal=(int)$w->fetchColumn();
            if($amount>$bal) { $pdo->rollBack(); fail('Số dư không đủ',422); }
            $pdo->prepare('UPDATE wallets SET balance=balance-?, updated_at=NOW() WHERE user_id=?')->execute([$amount,$u['id']]);
            $roundId=$d['round_id']??null;
            $pdo->prepare('INSERT INTO bets(user_id,game_id,round_id,selection,stake,status) VALUES(?,?,?,?,?,\'accepted\')')->execute([$u['id'],$game['id'],$roundId,$selection,$amount]);
            $betId=(int)$pdo->lastInsertId();
            $pdo->prepare("INSERT INTO wallet_transactions(user_id,type,amount,balance_after,reference_type,reference_id,description) VALUES(?,?,?,?,?,?,?)")
                ->execute([$u['id'],'bet',-$amount,$bal-$amount,'bet',$betId,'Virtual balance bet']);
            $pdo->commit(); ok(['bet_id'=>$betId,'balance'=>$bal-$amount]);
        } catch(Throwable $e){ $pdo->rollBack(); throw $e; }
    }

    if ($action === 'history') {
        $u=require_user();
        $st=$pdo->prepare("SELECT b.id,g.code game,b.selection,b.stake,b.payout,b.status,b.created_at FROM bets b JOIN games g ON g.id=b.game_id WHERE b.user_id=? ORDER BY b.id DESC LIMIT 100"); $st->execute([$u['id']]); ok(['items'=>$st->fetchAll()]);
    }

    fail('Action không tồn tại',404);
} catch(Throwable $e) {
    error_log((string)$e);
    fail('Server error',500);
}
