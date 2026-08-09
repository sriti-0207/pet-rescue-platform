const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:' });

// Pet Profile Model
const Pet = sequelize.define('Pet', {
  name: { type: DataTypes.STRING, allowNull: false },
  status: { 
    type: DataTypes.ENUM('Intake', 'In Medical Isolation', 'Available for Foster', 'Fostered', 'Pending Adoption', 'Adopted'),
    defaultValue: 'Intake'
  },
  dogAggressionLevel: { type: DataTypes.INTEGER, defaultValue: 0 },
  requiredMedicalTier: { type: DataTypes.INTEGER, defaultValue: 1 },
  weightKg: { type: DataTypes.FLOAT, allowNull: false },
  latitude: { type: DataTypes.FLOAT, allowNull: false },
  longitude: { type: DataTypes.FLOAT, allowNull: false }
});

// Foster Caregiver Model
const Foster = sequelize.define('Foster', {
  name: { type: DataTypes.STRING, allowNull: false },
  hasExistingPets: { type: DataTypes.BOOLEAN, defaultValue: false },
  certifiedMedicalTier: { type: DataTypes.INTEGER, defaultValue: 1 },
  maxPetWeightKg: { type: DataTypes.FLOAT, defaultValue: 25.0 },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
  latitude: { type: DataTypes.FLOAT, allowNull: false },
  longitude: { type: DataTypes.FLOAT, allowNull: false }
});

// Application Pipeline Model
const Application = sequelize.define('Application', {
  adopterName: { type: DataTypes.STRING, allowNull: false },
  petId: { type: DataTypes.INTEGER, allowNull: false },
  stage: {
    type: DataTypes.ENUM('Applied', 'Background Check Completed', 'Home Video Verified', 'Approved'),
    defaultValue: 'Applied'
  }
});

// Medical Intake Checklist Log
const MedicalLog = sequelize.define('MedicalLog', {
  petId: { type: DataTypes.INTEGER, allowNull: false },
  medicationName: { type: DataTypes.STRING, allowNull: false },
  dosage: { type: DataTypes.STRING, allowNull: false },
  administeredAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  notes: { type: DataTypes.TEXT }
});

// Supply Replenishment Request Model
const SupplyRequest = sequelize.define('SupplyRequest', {
  fosterId: { type: DataTypes.INTEGER, allowNull: false },
  itemType: { type: DataTypes.STRING, allowNull: false }, // e.g., Food, Litter, Medicine
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
  status: {
    type: DataTypes.ENUM('Requested', 'Fulfilled'),
    defaultValue: 'Requested'
  }
});

// Geolocated Supply Hub Location Model
const SupplyHub = sequelize.define('SupplyHub', {
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  latitude: { type: DataTypes.FLOAT, allowNull: false },
  longitude: { type: DataTypes.FLOAT, allowNull: false }
});

// State Lifecycle Audit Log
const StateLog = sequelize.define('StateLog', {
  petId: { type: DataTypes.INTEGER, allowNull: false },
  previousStatus: { type: DataTypes.STRING, allowNull: false },
  newStatus: { type: DataTypes.STRING, allowNull: false },
  timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
});

module.exports = { sequelize, Pet, Foster, Application, MedicalLog, SupplyRequest, SupplyHub, StateLog };