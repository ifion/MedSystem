const mongoose = require('mongoose');

// Use the latest mongoose connection options for better handling
const connectDB = async () => {
    try {
        // Connect to MongoDB with the latest default settings
        await mongoose.connect(process.env.MONGO_URI, {
            
            serverSelectionTimeoutMS: 5000,  // Timeout for server selection
            socketTimeoutMS: 45000,  // Timeout for server responses
        });

        console.log('MongoDB connected');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err.message);

        // Optional: Log more details to help debug the connection issue
        if (err.name === 'MongoNetworkError') {
            console.error('Network Error: Please check your MongoDB URI or network connection.');
        }

        // Exit the process with failure code to prevent further execution
        process.exit(1);
    }
};

module.exports = connectDB;