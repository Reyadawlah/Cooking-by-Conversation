import React, { useState, useRef } from 'react';
import { Camera, Mic, MicOff, Clock, Utensils, ChefHat } from 'lucide-react';
import './CookingAssistant.css';

export default function CookingAssistant() {
  const [formData, setFormData] = useState({
    cookingTime: '30min',
    dishType: 'main course',
    mood: [],
    dietary: [],
    ingredients: '',
    apiKey: 'YOUR_GEMINI_API_KEY_HERE'  // ← PUT YOUR API KEY HERE
  });
  
  const [uploadedImage, setUploadedImage] = useState(null);
  const [generatedRecipes, setGeneratedRecipes] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [voiceInput, setVoiceInput] = useState('');
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const moodOptions = ['spicy', 'comfort food', 'healthy', 'cheesy', 'sour', 'sweet'];
  const dietaryOptions = ['high-protein', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'none'];

  const handleCheckboxChange = (category, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(item => item !== value)
        : [...prev[category], value]
    }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const startVoiceRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setVoiceInput(transcript);
        handleVoiceQuery(transcript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } else {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
    }
  };

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleVoiceQuery = async (query) => {
    if (!formData.apiKey) {
      alert('Please configure your Gemini API key!');
      return;
    }

    const newMessage = { role: 'user', content: query };
    setConversationHistory(prev => [...prev, newMessage]);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${formData.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `You are a helpful cooking assistant. The user is asking: ${query}. Provide a concise and helpful answer.` }]
            }]
          })
        }
      );

      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not process that.';
      
      setConversationHistory(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('Error:', error);
      setConversationHistory(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.' 
      }]);
    }
  };

  const generateRecipes = async () => {
    if (!formData.apiKey) {
      alert('Please configure your Gemini API key!');
      return;
    }

    if (!formData.ingredients && !uploadedImage) {
      alert('Please enter ingredients or upload an image!');
      return;
    }

    setIsGenerating(true);

    const prompt = `Generate 3 recipe suggestions based on the following criteria:
    - Cooking time: ${formData.cookingTime}
    - Type of dish: ${formData.dishType}
    - Mood/flavor profile: ${formData.mood.join(', ') || 'any'}
    - Dietary preferences: ${formData.dietary.join(', ') || 'none'}
    - Available ingredients: ${formData.ingredients}
    ${uploadedImage ? '- (User also provided an image of ingredients)' : ''}
    
    For each recipe, provide:
    1. Recipe name
    2. Prep time
    3. Ingredients list
    4. Step-by-step instructions
    5. Difficulty level
    
    Format as JSON array with objects containing: name, prepTime, ingredients (array), instructions (array), difficulty`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${formData.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        }
      );

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      let recipes = [];
      try {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          recipes = JSON.parse(jsonMatch[0]);
        } else {
          recipes = [{
            name: 'Generated Recipe',
            prepTime: formData.cookingTime,
            ingredients: formData.ingredients.split(',').map(i => i.trim()),
            instructions: responseText.split('\n').filter(line => line.trim()),
            difficulty: 'Medium'
          }];
        }
      } catch {
        recipes = [{
          name: 'Recipe Suggestion',
          prepTime: formData.cookingTime,
          ingredients: ['See details below'],
          instructions: [responseText],
          difficulty: 'Medium'
        }];
      }
      
      setGeneratedRecipes(recipes);
    } catch (error) {
      console.error('Error generating recipes:', error);
      alert('Error generating recipes. Please check your API key and try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="cooking-assistant-container">
      <div className="cooking-assistant-wrapper">
        {/* Header */}
        <div className="card header-card">
          <div className="header-content">
            <ChefHat className="header-icon" />
            <div>
              <h1 className="header-title">Cooking Assistant</h1>
              <p className="header-subtitle">What are you in the mood for?</p>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="card">
          <h2 className="section-title">Select your Recipe Preferences</h2>
          
          {/* Cooking Time */}
          <div className="form-group">
            <label className="form-label">
              <Clock className="label-icon" />
              Maximum Cooking Time
            </label>
            <select
              value={formData.cookingTime}
              onChange={(e) => setFormData(prev => ({ ...prev, cookingTime: e.target.value }))}
              className="select-field"
            >
              <option value="30min">30 minutes</option>
              <option value="1hour">1 hour</option>
              <option value="2hours">2 hours</option>
              <option value="2+hours">2+ hours</option>
            </select>
          </div>

          {/* Type of Dish */}
          <div className="form-group">
            <label className="form-label">
              <Utensils className="label-icon" />
              Type of Dish
            </label>
            <select
              value={formData.dishType}
              onChange={(e) => setFormData(prev => ({ ...prev, dishType: e.target.value }))}
              className="select-field"
            >
              <option value="appetizer">Appetizer</option>
              <option value="main course">Main Course</option>
              <option value="dessert">Dessert</option>
              <option value="snack">Snack</option>
              <option value="drinks">Drinks</option>
            </select>
          </div>

          {/* Mood */}
          <div className="form-group">
            <label className="form-label">Mood</label>
            <div className="checkbox-grid">
              {moodOptions.map(mood => (
                <label key={mood} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.mood.includes(mood)}
                    onChange={() => handleCheckboxChange('mood', mood)}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">{mood}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Dietary Preferences */}
          <div className="form-group">
            <label className="form-label">Dietary Preferences</label>
            <div className="checkbox-grid">
              {dietaryOptions.map(diet => (
                <label key={diet} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.dietary.includes(diet)}
                    onChange={() => handleCheckboxChange('dietary', diet)}
                    className="checkbox-input"
                  />
                  <span className="checkbox-text">{diet}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ingredients Input */}
          <div className="form-group">
            <label className="form-label">Enter Ingredients</label>
            <textarea
              placeholder="e.g. tomatoes, onions, chicken, ..."
              value={formData.ingredients}
              onChange={(e) => setFormData(prev => ({ ...prev, ingredients: e.target.value }))}
              rows={3}
              className="textarea-field"
            />
          </div>

          {/* Image Upload */}
          <div className="form-group">
            <label className="form-label">Or Upload Image of Ingredients</label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="upload-button"
            >
              <Camera className="button-icon" />
              Choose Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            {uploadedImage && (
              <div className="image-preview-container">
                <img src={uploadedImage} alt="Uploaded ingredients" className="image-preview" />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={generateRecipes}
            disabled={isGenerating}
            className={`submit-button ${isGenerating ? 'button-disabled' : ''}`}
          >
            {isGenerating ? 'Generating Recipes...' : 'Generate Recipes'}
          </button>
        </div>

        {/* Generated Recipes */}
        {generatedRecipes.length > 0 && (
          <div className="card">
            <h2 className="section-title">Your Recipes</h2>
            <div className="recipes-container">
              {generatedRecipes.map((recipe, idx) => (
                <div key={idx} className="recipe-card">
                  <h3 className="recipe-title">{recipe.name}</h3>
                  <p className="recipe-meta"> {recipe.prepTime} | {recipe.difficulty}</p>
                  <div className="recipe-section">
                    <h4 className="recipe-subtitle">Ingredients:</h4>
                    <ul className="recipe-list">
                      {recipe.ingredients?.map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="recipe-section">
                    <h4 className="recipe-subtitle">Instructions:</h4>
                    <ol className="recipe-list recipe-list-numbered">
                      {recipe.instructions?.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Voice Interaction */}
        <div className="card">
          <h2 className="section-title">Voice Assistant</h2>
          <p className="section-description">Feel free to ask questions!</p>
          
          <button
            onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
            className={`voice-button ${isListening ? 'voice-button-active' : ''}`}
          >
            {isListening ? (
              <>
                <MicOff className="button-icon" />
                Stop Listening
              </>
            ) : (
              <>
                <Mic className="button-icon" />
                Start Voice Input
              </>
            )}
          </button>

          {/* Conversation History */}
          {conversationHistory.length > 0 && (
            <div className="conversation-container">
              {conversationHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`message ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
                >
                  <p className="message-role">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </p>
                  <p className="message-content">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
