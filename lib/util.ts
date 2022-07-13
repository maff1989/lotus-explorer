import { PipelineStage } from "mongoose";

export const getChartsDifficultyAggregation: {
  [timespan: string]: PipelineStage
} = {
  week: {
    '$project': {
      // filter blocks 
      'blocks': {
        '$filter': {
          'input': '$blocks',
          'as': 'block',
          'cond': {
            // get difficulty from 6 blocks from each hour of the day
            '$and': [
              { '$gte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
              { '$lte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 23]},
              { '$or': [
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 10]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 40]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 50]},
              ]}
            ]
          }
        }
      }
    }
  },
  month: {
    '$project': {
      // filter blocks 
      'blocks': {
        '$filter': {
          'input': '$blocks',
          'as': 'block',
          'cond': {
            // get difficulty from 2 blocks per every 4th hour of the day
            '$and': [
              { '$or': [
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 4]},
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 8]},
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 12]},
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 16]},
                { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
              ]},
              { '$or': [
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
              ]}
            ]
          }
        }
      }
    }
  },
  quarter: {
    '$project': {
      // filter blocks 
      'blocks': {
        '$filter': {
          'input': '$blocks',
          'as': 'block',
          'cond': {
            // get difficulty from 1 block per day
            '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]
          }
        }
      }
    }
  },
  year: {
    '$project': {
      // filter blocks 
      'blocks': {
        '$filter': {
          'input': '$blocks',
          'as': 'block',
          'cond': {
            // get difficulty from 3 days per month
            '$and': [
              { '$or': [
                { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 1]},
                { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 15]},
                { '$eq': [{ '$dayOfMonth': {'$dateFromString': {'dateString': "$$block.t"}}}, 31]},
              ]},
              { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
            ]
          }
        }
      }
    }
  }
};
