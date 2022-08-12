<?php
$lotus_zeromq = 'tcp://127.0.0.1:10632';
// 2 I/O threads, non-persistent
$context = new ZMQContext(2, false);
// New subscriber socket
$socket = new ZMQSocket($context, ZMQ::SOCKET_SUB);
// Set up zeromq subscription
d("Connecting to ZeroMQ at {$lotus_zeromq}...");
$socket->connect($lotus_zeromq);
$socket->setSockOpt(ZMQ::SOCKOPT_SUBSCRIBE, 'hashblock');
d("Connected");

// Runtime
do {
  try {
    $output = '';
    // wait for new block from lotusd
    d("Waiting for new block...");
    $socket->recvMulti();
    //print(d()." Message: ".json_encode($msg)."\r\n");
    d("New block detected, syncing lotus-explorer db...");
    exec("node scripts/sync.js index update", $output, $status);
    if($status !== 0) {
      d("Error: '{$on_message}' failed: {$output}");
    }
    foreach($output as $line) { d("EXEC> {$line}"); }
    d("Done");
  } catch (ZMQSocketException $e) {
    d("Fatal error: {$e->getMessage()}");
    @$socket->disconnect($lotus_zeromq);
    exit(1);
  }
} while (true);

// Disconnect the socket
d(" Disconnecting from ZeroMQ...");
$socket->disconnect($lotus_zeromq);
d("Done");

// date/time function
function d($msg = "") {
  print date('Y-m-d H:i:s', microtime(true))." {$msg}\r\n";
}
?>
