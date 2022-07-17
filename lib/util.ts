import { PipelineStage } from "mongoose";

export const getChartsDifficultyAggregation: {
  [timespan: string]: PipelineStage
} = {
  week: {
    '$group': {
      '_id': {
        "$dateToString": {
          "format": "%Y-%m-%d %H",
          "date": {
            '$dateFromString': { 'dateString': "$localeTimestamp" }
          }
        }
      },
      'difficulty': {
        '$max': "$difficulty"
      }
    }
  },
  month: {
    '$group': {
      '_id': {
        "$dateToString": {
          "format": "%Y-%m-%d %H",
          "date": {
            '$dateFromString': { 'dateString': "$localeTimestamp" }
          }
        }
      },
      'difficulty': {
        '$max': "$difficulty"
      }
    }
  },
  quarter: {
    '$group': {
      '_id': {
        "$dateToString": {
          "format": "%Y-%m-%d %H",
          "date": {
            '$dateFromString': { 'dateString': "$localeTimestamp" }
          }
        }
      },
      'difficulty': {
        '$max': "$difficulty"
      }
    }
  },
  year: {
    '$group': {
      '_id': {
        "$dateToString": {
          "format": "%Y-%m-%d",
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
};
