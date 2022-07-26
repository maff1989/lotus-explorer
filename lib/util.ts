import { PipelineStage } from "mongoose";

export const getChartsDifficultyAggregation: {
  [timespan: string]: PipelineStage
} = {
  week: {
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
  },
  month: {
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
  },
  quarter: {
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
  },
  year: {
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
};
