import { Injectable } from '@nestjs/common';
const cluster = require('cluster'); 

import * as process from 'node:process';

const numCPUs = parseInt(process.argv[2] || "1");

@Injectable()
export class ClusterService {
  static clusterize(callback: Function): void {
    if (cluster.isMaster) {
      console.log(`MASTER SERVER (${process.pid}) IS RUNNING `, numCPUs);

      for (let i = 0; i < numCPUs; i++) {
        console.log(`Forking worker ${i}`);
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
      });
    } else {
      callback();
    }
  }
}