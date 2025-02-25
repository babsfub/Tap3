// lib/services/api.ts
import { debugService } from './DebugService.js';

class ApiService {
  private baseUrl: string = 'https://api.tap3.me';

  private getEndpoint(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }

  async getCardDesign(cardId: number): Promise<any> {
    try {
      debugService.info(`Fetching card design for ID: ${cardId}`);
      const response = await fetch(`${this.baseUrl}/catalogue/${cardId}`);
      
      // Vérifier si la réponse est OK
      if (!response.ok) {
        debugService.error(`API error: ${response.status}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Vérifier si les données sont dans le format attendu
      if (!data || !Array.isArray(data) || data.length === 0) {
        debugService.warn('API returned unexpected data format');
        return {}; // Retourner un objet vide comme fallback
      }
      
      debugService.debug(`Card design fetched successfully for ID: ${cardId}`);
      return {
        svg: data[0]?.svg || 'default',
        id_model: data[0]?.id_model || 0
      };
    } catch (error) {
      debugService.error(`Failed to fetch card design: ${error instanceof Error ? error.message : String(error)}`);
      return {}; // Retourner un objet vide en cas d'erreur
    }
  }

  async getCardStyle(cardId: number): Promise<any> {
    try {
      debugService.info(`Fetching card style for ID: ${cardId}`);
      const response = await fetch(`${this.baseUrl}/catalogue/${cardId}`);
      
      if (!response.ok) {
        debugService.error(`API error: ${response.status}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        debugService.warn(`No style data found for card ID: ${cardId}`);
        return { css: '', model: 0 };
      }
      
      debugService.debug(`Card style fetched successfully for ID: ${cardId}`);
      return {
        css: data[0]?.css || '',
        model: data[0]?.id_model || 0
      };
    } catch (error) {
      debugService.error(`Failed to fetch card style: ${error instanceof Error ? error.message : String(error)}`);
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
      debugService.info(`Verifying card ${cardId} with URL hash`);
      
      // Récupérer l'URL stockée en base de données
      const storedCard = await this.getCardById(cardId);
      if (!storedCard || !storedCard.url) {
        debugService.error(`Card verification failed - no stored URL for ID: ${cardId}`);
        return false;
      }
      
      // Extraire seulement la partie après le '#' des deux URLs
      const extractHash = (url: string) => {
        const hashIndex = url.indexOf('#');
        return hashIndex >= 0 ? url.substring(hashIndex) : url;
      };
      
      const storedHash = extractHash(storedCard.url);
      const receivedHash = extractHash(cardUrl);
      
      const match = storedHash === receivedHash;
      
      debugService.info(`Card verification result: ${match ? 'MATCH' : 'NO MATCH'}`);
      debugService.debug(`Stored domain: ${storedCard.url.split('#')[0]}, Received domain: ${cardUrl.split('#')[0]}`);
      
      // Comparer uniquement la partie hash
      return match;
    } catch (error) {
      debugService.error(`Card verification error: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async getCardById(cardId: number): Promise<{ url: string } | null> {
    try {
      debugService.debug(`Fetching card data for ID: ${cardId}`);
      const response = await fetch(this.getEndpoint(`card/${cardId}`));
      if (!response.ok) {
        debugService.error(`Failed to fetch card ${cardId}: ${response.status}`);
        throw new Error('Failed to fetch card by ID');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      debugService.error(`Failed to get card by ID: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async getMaticPrice(): Promise<number> {
    try {
      debugService.info('Fetching MATIC price');
      const response = await fetch(this.getEndpoint('price/MATIC'));
      if (!response.ok) {
        debugService.error(`Failed to fetch MATIC price: ${response.status}`);
        throw new Error('Failed to fetch MATIC price');
      }

      const data = await response.json();
      debugService.debug(`MATIC price: ${data.usd} USD`);
      return data.usd;
    } catch (error) {
      debugService.error(`Failed to get MATIC price: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async registerDevice(deviceToken: string, cardId: number): Promise<boolean> {
    try {
      debugService.info(`Registering device for card ID: ${cardId}`);
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
        debugService.error(`Device registration failed: ${response.status}`);
        throw new Error('Failed to register device');
      }

      const data = await response.json();
      debugService.info(`Device registration ${data.success ? 'successful' : 'failed'}`);
      return data.success;
    } catch (error) {
      debugService.error(`Device registration failed: ${error instanceof Error ? error.message : String(error)}`);
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
      debugService.info(`Fetching transaction history for address: ${cardAddress}`);
      const response = await fetch(this.getEndpoint(`history/${cardAddress}`));
      if (!response.ok) {
        debugService.error(`Failed to fetch card history: ${response.status}`);
        throw new Error('Failed to fetch card history');
      }

      const data = await response.json();
      debugService.debug(`Fetched ${data.transactions?.length || 0} transactions`);
      return data.transactions;
    } catch (error) {
      debugService.error(`Failed to get card history: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  // Nouvelle méthode pour tester l'API
  async testConnection(): Promise<boolean> {
    try {
      debugService.info('Testing API connection');
      const response = await fetch(this.getEndpoint('health'));
      const isConnected = response.ok;
      debugService.info(`API connection test: ${isConnected ? 'SUCCESS' : 'FAILED'}`);
      return isConnected;
    } catch (error) {
      debugService.error(`API connection test failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}

export const apiService = new ApiService();