import { PipelineStage } from "mongoose";

const XPI_DIVISOR = 1000000;

/**
 * Converts satoshi units into XPI units
 * @param sats Amount of satoshis
 * @returns {number} XPI units
 */
export const toXPI = (sats: number): number => {
  return sats / XPI_DIVISOR;
};

/**
 * Converts XPI units into satoshi units
 * @param xpi Amount of XPI
 * @returns {number} Satoshi units
 */
export const toSats = (xpi: number): number => {
  return xpi * XPI_DIVISOR;
};

export const chartsInflationAggregation: {
  [timespan: string]: PipelineStage[]
} = {
  day: [
    { $group: {
      _id: "$localeTimestamp",
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
      inflationTotal: { $sum: { $subtract: [ "$subsidy", "$burned" ]}},
    }}
  ],
  week: [
    {
      $project: {
        minute: { $minute: { $dateFromString: { dateString: "$localeTimestamp" }}},
        localeTimestamp: "$localeTimestamp",
        subsidy: "$subsidy",
        burned: "$burned"        
      }
    },
    {
      $match: {
        $expr: {
          $or: [
            { $and: [
              { $gte: ["$minute", 0]},
              { $lte: ["$minute", 19]},
            ]},
            { $and: [
              { $gte: ["$minute", 20]},
              { $lte: ["$minute", 39]},
            ]},
            { $and: [
              { $gte: ["$minute", 40]},
              { $lte: ["$minute", 59]},
            ]},
          ]
        }
      }
    },
    { $group: {
      _id: {
        "$dateToString": {
          "format": "%m-%d-%Y %H:%M",
          "date": {
            $dateFromString: { dateString: "$localeTimestamp" }
          }
        }
      },
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
      inflationTotal: { $sum: { $subtract: [ "$subsidy", "$burned" ]}},
    }}
  ],
  month: [
    {
      $project: {
        hour: { $hour: { $dateFromString: { dateString: "$localeTimestamp" }}},
        localeTimestamp: "$localeTimestamp",
        subsidy: "$subsidy",
        burned: "$burned"        
      }
    },
    {
      $match: {
        $expr: {
          $or: [
            { $and: [
              { $gte: ["$hour", 0]},
              { $lte: ["$hour", 3]},
            ]},
            { $and: [
              { $gte: ["$hour", 4]},
              { $lte: ["$hour", 7]},
            ]},
            { $and: [
              { $gte: ["$hour", 8]},
              { $lte: ["$hour", 11]},
            ]},
            { $and: [
              { $gte: ["$hour", 12]},
              { $lte: ["$hour", 15]},
            ]},
            { $and: [
              { $gte: ["$hour", 16]},
              { $lte: ["$hour", 19]},
            ]},
            { $and: [
              { $gte: ["$hour", 20]},
              { $lte: ["$hour", 23]},
            ]},
          ]
        }
      }
    },
    { $group: {
      _id: {
        "$dateToString": {
          "format": "%m-%d-%Y %H",
          "date": {
            $dateFromString: { dateString: "$localeTimestamp" }
          }
        }
      },
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
      inflationTotal: { $sum: { $subtract: [ "$subsidy", "$burned" ]}},
    }}
  ],
};

export const chartsDifficultyAggregation: {
  [timespan: string]: PipelineStage[]
} = {
  week: [
    { $group: {
        _id: {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              $dateFromString: { dateString: "$localeTimestamp" }
            }
          }
        },
        difficulty: { $max: "$difficulty" }
      }
    }
  ],
  month: [
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 0]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 4]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 8]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 12]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 16]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 20]},
          ]
        }
      }
    },
    {
      $group: {
        _id: {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              $dateFromString: { dateString: "$localeTimestamp" }
            }
          }
        },
        difficulty: { $max: "$difficulty" }
      }
    }
  ],
  quarter: [
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 0]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 8]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 16]},
          ]
        }
      }
    },
    {
      $group: {
        _id: {
          "$dateToString": {
            "format": "%m-%d-%Y %H",
            "date": {
              $dateFromString: { dateString: "$localeTimestamp" }
            }
          }
        },
        difficulty: { $max: "$difficulty" }
      }
    }
  ],
  year: [
    {
      $group: {
        _id: {
          "$dateToString": {
            "format": "%m-%d-%Y",
            "date": {
              $dateFromString: { dateString: "$localeTimestamp" }
            }
          }
        },
        difficulty: { $max: "$difficulty" }
      }
    }
  ]
};
