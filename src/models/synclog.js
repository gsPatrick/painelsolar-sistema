'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SyncLog extends Model {
    static associate(models) {
      // define association here
    }
  }
  SyncLog.init({
    service: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'meta_sync'
    },
    status: {
      type: DataTypes.ENUM('success', 'error', 'running'),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    leads_found: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    leads_added: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    error_details: {
      type: DataTypes.JSON,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    finished_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'SyncLog',
    tableName: 'sync_logs',
    underscored: true,
  });
  return SyncLog;
};
