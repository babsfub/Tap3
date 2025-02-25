// lib/services/api.ts
import type { CardDesign } from '$lib/types.js';

class ApiService {
  private baseUrl: string = 'https://api.tap3.me';

  private getEndpoint(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }

  // Dans api.js
async getCardDesign(cardId: number): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/catalogue/${cardId}`);
      
      // Vérifier si la réponse est OK
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Vérifier si les données sont dans le format attendu
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('API returned unexpected data format:', data);
        return {}; // Retourner un objet vide comme fallback
      }
      
      return {
        svg: data[0]?.svg || 'default',
        id_model: data[0]?.id_model || 0
      };
    } catch (error) {
      console.error('Failed to fetch card design:', error);
      return {}; // Retourner un objet vide en cas d'erreur
    }
  }

  async getCardStyle(cardId: number): Promise<any> {
    try {
      // Utiliser la même API que getCardDesign si c'est la même source
      // Ou implémenter l'appel à votre API de style
      const response = await fetch(`${this.baseUrl}/catalogue/${cardId}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        return { css: '', model: 0 };
      }
      
      return {
        css: data[0]?.css || '',
        model: data[0]?.id_model || 0
      };
    } catch (error) {
      console.error('Failed to fetch card style:', error);
      return { css: '', model: 0 };
    }
  }

  private processCardCSS(css: string): string {
    if (!css) return '';

    return css
      .replace(
        /url\(['"]?(?:\.\/)?bgs\//g, 
        `url('${this.baseUrl}/bgs/`
      )
      .replace(/(['"])\)/g, '$1)')
      .replace(/contain/g, 'cover')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async verifyCard(cardId: number, cardUrl: string): Promise<boolean> {
    try {
      const response = await fetch(this.getEndpoint('verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cardId,
          signature: cardUrl
        })
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error('Card verification failed:', error);
      return false;
    }
  }

  async getMaticPrice(): Promise<number> {
    try {
      const response = await fetch(this.getEndpoint('price/MATIC'));
      if (!response.ok) {
        throw new Error('Failed to fetch MATIC price');
      }

      const data = await response.json();
      return data.usd;
    } catch (error) {
      console.error('Failed to get MATIC price:', error);
      throw error;
    }
  }

  async registerDevice(deviceToken: string, cardId: number): Promise<boolean> {
    try {
      const response = await fetch(this.getEndpoint('register/device'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceToken,
          cardId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to register device');
      }

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Device registration failed:', error);
      return false;
    }
  }


  private processCardStyle(css: string, model: number): string {
    let baseStyle = 'background-color: ';
    
    switch (model) {
      case 4:
        baseStyle += 'black; ';
        break;
      case 5:
        baseStyle += '#c7252b; ';
        break;
      case 6:
        baseStyle += '#006faf; ';
        break;
      default:
        baseStyle += 'white; ';
        break;
    }

    return baseStyle + css;
  }

  async getCardHistory(cardAddress: string): Promise<Array<{
    hash: string,
    date: string,
    type: 'in' | 'out',
    amount: string,
    from: string,
    to: string
  }>> {
    try {
      const response = await fetch(this.getEndpoint(`history/${cardAddress}`));
      if (!response.ok) {
        throw new Error('Failed to fetch card history');
      }

      const data = await response.json();
      return data.transactions;
    } catch (error) {
      console.error('Failed to get card history:', error);
      return [];
    }
  }

  // Nouvelle méthode pour tester l'API
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.getEndpoint('health'));
      return response.ok;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }
}

export const apiService = new ApiService();