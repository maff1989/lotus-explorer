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
      height: { $first: "$height" },
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
    }}
  ],
  week: [
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 0]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 5]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 10]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 15]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 20]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 25]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 30]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 35]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 40]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 45]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 50]},
            { $eq: [{ $minute: { $dateFromString: { dateString: "$localeTimestamp" }}}, 55]},
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
      height: { $first: "$height" },
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
    }}
  ],
  month: [
    {
      $match: {
        $expr: {
          $or: [
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 0]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 2]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 4]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 6]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 8]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 10]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 12]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 14]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 16]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 18]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 20]},
            { $eq: [{ $hour: { $dateFromString: { dateString: "$localeTimestamp" }}}, 22]},
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
      height: { $first: "$height" },
      inflation: { $min: { $subtract: [ "$subsidy", "$burned" ]}},
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
