import { PipelineStage } from "mongoose";

export const chartsDifficultyAggregation: {
  [timespan: string]: PipelineStage[]
} = {
  week: [
    {
      '$group': {
        '_id': {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              '$dateFromString': { 'dateString': "$localeTimestamp" }
            }
          }
        },
        'difficulty': {
          '$max': "$difficulty"
        }
      }
    }
  ],
  month: [
    {
      '$match': {
        '$expr': {
          '$or': [
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 0]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 4]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 8]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 12]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 16]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 20]},
          ]
        }
      }
    },
    {
      '$group': {
        '_id': {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              '$dateFromString': { 'dateString': "$localeTimestamp" }
            }
          }
        },
        'difficulty': {
          '$max': "$difficulty"
        }
      }
    }
  ],
  quarter: [
    {
      '$match': {
        '$expr': {
          '$or': [
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 0]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 8]},
            {'$eq': [{ '$hour': { '$dateFromString': { 'dateString': '$localeTimestamp' }}}, 16]},
          ]
        }
      }
    },
    {
      '$group': {
        '_id': {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              '$dateFromString': { 'dateString': "$localeTimestamp" }
            }
          }
        },
        'difficulty': {
          '$max': "$difficulty"
        }
      }
    }
  ],
  year: [
    {
      '$group': {
        '_id': {
          "$dateToString": {
            "format": "%m-%d-%Y",
            "date": {
              '$dateFromString': { 'dateString': "$localeTimestamp" }
            }
          }
        },
        'difficulty': {
          '$max': "$difficulty"
        }
      }
    }
  ]
};
