import cluster from 'cluster';
import * as os from 'os';
import * as fs from 'fs/promises';

const main = async () => {
  if (cluster.isMaster) {
    try {
      await fs.appendFile('./tmp/cluster.pid', process.pid.toString());
      console.log('Starting cluster with pid: ' + process.pid);
      process.on('SIGINT', () => {
        console.log('Cluster shutting down..');
        setTimeout(() => {
          for (const id in cluster.workers) {
            console.log('Worker shutting down (' + id + ')');
            cluster.workers[id].kill();
          }
          // exit the master process
          setTimeout(() => process.exit(0), 3000);
        }, 1000);
      });
      // set up workers
      const cpuCount = os.cpus().length;
      for (let i = 0; i < cpuCount; i++) {
        cluster.fork();
      }
      // listen for dying workers
      cluster.on('exit', (worker, code, signal) => {
        if (worker.process.exitCode === 0) {
          console.log('Worker shut down.');
        } else if (
          (signal != 'SIGINT')
          && (worker.process.exitCode !== 0)
          && (worker.exitedAfterDisconnect !== true)
        ) {
          console.log('Cluster restarting...');
          cluster.fork();
        }
      });
    } catch (e :any) {
      console.log('Error: unable to create cluster.pid');
      process.exit(1);
    }
  } else {
    require('./instance.ts')
  }
};
main();
